// Minimal Linear GraphQL client. Server-only: LINEAR_API_KEY must never reach
// the browser, so every caller is an API route.
//
// Schema notes that are easy to get wrong:
//  - Retiring a label (`issueLabelRetire`) is not the same as archiving an
//    entity. A retired label stays on the issues that already carry it and
//    still shows in filters and insights; it just can't be applied to anything
//    new. That is why nothing here ever calls `issueLabelDelete`, which is
//    irreversible and strips the label off issues.
//  - Retired labels come back from `children` with `retiredAt` set, so there is
//    no need to ask for archived entities.

const LINEAR_API = 'https://api.linear.app/graphql';

export function isLinearConfigured(): boolean {
  return Boolean(process.env.LINEAR_API_KEY);
}

export class LinearError extends Error {}

async function linearRequest<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const key = process.env.LINEAR_API_KEY;
  if (!key) throw new LinearError('LINEAR_API_KEY is not configured on the server.');

  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Personal API keys go in Authorization as-is; OAuth tokens are bearers.
      Authorization: key.startsWith('lin_oauth_') ? `Bearer ${key}` : key,
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });

  if (!res.ok) throw new LinearError(`Linear API returned ${res.status}`);

  const json = await res.json();
  if (json.errors?.length) {
    throw new LinearError(json.errors.map((e: { message: string }) => e.message).join('; '));
  }
  return json.data as T;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LinearLabel {
  id: string;
  name: string;
  color: string;
  retiredAt: string | null;
}

export interface LinearMilestone {
  id: string;
  name: string;
  targetDate: string | null; // "YYYY-MM-DD"
}

export interface LinearProject {
  id: string;
  name: string;
  url: string;
  targetDate: string | null;
  teams: { id: string; key: string; name: string }[];
  milestones: LinearMilestone[];
}

export interface LinearIssue {
  id: string;
  identifier: string;
  stateType: string;      // backlog | unstarted | started | completed | canceled | triage
  labelIds: string[];
  // Issues that block this one, with the labels they carry.
  blockedBy: { id: string; labelIds: string[] }[];
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const PROJECTS_QUERY = `
  query MistyProjects($after: String) {
    projects(first: 50, after: $after, orderBy: updatedAt) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id name url targetDate
        teams(first: 10) { nodes { id key name } }
        projectMilestones(first: 50) { nodes { id name targetDate } }
      }
    }
  }
`;

export async function listProjects(): Promise<LinearProject[]> {
  const out: LinearProject[] = [];
  let after: string | null = null;

  // Two pages is plenty for a picker sorted by recent activity.
  for (let page = 0; page < 2; page++) {
    const data: any = await linearRequest(PROJECTS_QUERY, { after });
    for (const n of data.projects.nodes) {
      out.push({
        id: n.id,
        name: n.name,
        url: n.url,
        targetDate: n.targetDate ?? null,
        teams: n.teams.nodes,
        milestones: n.projectMilestones.nodes.map((m: any) => ({
          id: m.id,
          name: m.name,
          targetDate: m.targetDate ?? null,
        })),
      });
    }
    if (!data.projects.pageInfo.hasNextPage) break;
    after = data.projects.pageInfo.endCursor;
  }
  return out;
}

const PROJECT_QUERY = `
  query MistyProject($id: String!) {
    project(id: $id) {
      id name url targetDate
      teams(first: 10) { nodes { id key name } }
      projectMilestones(first: 50) { nodes { id name targetDate } }
    }
  }
`;

// Single-project read. The reconciler runs on every scope edit, so it must not
// walk the whole project list just to read one target date.
export async function getProject(id: string): Promise<LinearProject | null> {
  const data: any = await linearRequest(PROJECT_QUERY, { id });
  if (!data.project) return null;
  const n = data.project;
  return {
    id: n.id,
    name: n.name,
    url: n.url,
    targetDate: n.targetDate ?? null,
    teams: n.teams.nodes,
    milestones: n.projectMilestones.nodes.map((m: any) => ({
      id: m.id,
      name: m.name,
      targetDate: m.targetDate ?? null,
    })),
  };
}

const GROUP_QUERY = `
  query MistyLabelGroup($id: String!) {
    issueLabel(id: $id) {
      id name
      children(first: 250) { nodes { id name color retiredAt } }
    }
  }
`;

// Returns null when the group no longer exists in Linear (someone deleted it).
export async function getLabelGroup(
  groupId: string
): Promise<{ id: string; name: string; children: LinearLabel[] } | null> {
  try {
    const data: any = await linearRequest(GROUP_QUERY, { id: groupId });
    if (!data.issueLabel) return null;
    return {
      id: data.issueLabel.id,
      name: data.issueLabel.name,
      children: data.issueLabel.children.nodes.map((c: any) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        retiredAt: c.retiredAt ?? null,
      })),
    };
  } catch {
    return null;
  }
}

const ISSUES_QUERY = `
  query MistyProjectIssues($filter: IssueFilter!, $after: String) {
    issues(first: 100, after: $after, filter: $filter) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id identifier
        state { type }
        labels(first: 20) { nodes { id } }
        inverseRelations(first: 20) {
          nodes { type issue { id labels(first: 20) { nodes { id } } } }
        }
      }
    }
  }
`;

export async function listProjectIssues(
  projectId: string,
  milestoneId?: string
): Promise<LinearIssue[]> {
  const filter: Record<string, unknown> = { project: { id: { eq: projectId } } };
  if (milestoneId) filter.projectMilestone = { id: { eq: milestoneId } };

  const out: LinearIssue[] = [];
  let after: string | null = null;

  // Cap the walk: a hill-sized project is tens to low hundreds of issues, and
  // an unbounded loop here would be a nasty way to discover otherwise.
  for (let page = 0; page < 5; page++) {
    const data: any = await linearRequest(ISSUES_QUERY, { filter, after });
    for (const n of data.issues.nodes) {
      out.push({
        id: n.id,
        identifier: n.identifier,
        stateType: n.state?.type ?? 'backlog',
        labelIds: n.labels.nodes.map((l: any) => l.id),
        blockedBy: n.inverseRelations.nodes
          .filter((r: any) => r.type === 'blocks')
          .map((r: any) => ({
            id: r.issue.id,
            labelIds: r.issue.labels.nodes.map((l: any) => l.id),
          })),
      });
    }
    if (!data.issues.pageInfo.hasNextPage) break;
    after = data.issues.pageInfo.endCursor;
  }
  return out;
}

const ORG_QUERY = `query MistyOrg { organization { urlKey } }`;

export async function getOrgSlug(): Promise<string> {
  const data: any = await linearRequest(ORG_QUERY);
  return data.organization.urlKey;
}

// ---------------------------------------------------------------------------
// Writes — confined to the hill's own label group
// ---------------------------------------------------------------------------

const CREATE_LABEL = `
  mutation MistyCreateLabel($input: IssueLabelCreateInput!) {
    issueLabelCreate(input: $input) {
      success
      issueLabel { id name color retiredAt }
    }
  }
`;

// Groups are created at workspace level on purpose. A label's team can't be
// changed after creation, so the irreversible choice is made the way that
// can't box us in when a project later spans teams.
export async function createLabelGroup(name: string): Promise<LinearLabel> {
  const data: any = await linearRequest(CREATE_LABEL, {
    input: {
      name,
      isGroup: true,
      // Single-select is not a preference, it is the only thing that works:
      // this workspace rejects the alternative with "multi-select issue label
      // groups disabled", and the create fails outright. Multi-select would be
      // better — a ticket serving two scopes could say so, and double counting
      // in a gut-check number is visible and harmless where silent
      // under-tagging is not. buildSignals() already counts an issue under
      // every scope label it carries, so if the workspace ever allows it this
      // is the only line that has to change.
      groupType: 'singleSelect',
      description: 'Managed by Misty — one label per hill scope.',
    },
  });
  return normalizeLabel(data.issueLabelCreate.issueLabel);
}

export async function createChildLabel(
  parentId: string,
  name: string,
  color: string
): Promise<LinearLabel> {
  const data: any = await linearRequest(CREATE_LABEL, {
    input: { name, color, parentId },
  });
  return normalizeLabel(data.issueLabelCreate.issueLabel);
}

const UPDATE_LABEL = `
  mutation MistyUpdateLabel($id: String!, $input: IssueLabelUpdateInput!) {
    issueLabelUpdate(id: $id, input: $input) {
      success
      issueLabel { id name color retiredAt }
    }
  }
`;

export async function updateLabel(
  id: string,
  input: { name?: string; color?: string; parentId?: string }
): Promise<LinearLabel> {
  const data: any = await linearRequest(UPDATE_LABEL, { id, input });
  return normalizeLabel(data.issueLabelUpdate.issueLabel);
}

const RETIRE_LABEL = `mutation MistyRetireLabel($id: String!) { issueLabelRetire(id: $id) { success } }`;
const RESTORE_LABEL = `mutation MistyRestoreLabel($id: String!) { issueLabelRestore(id: $id) { success } }`;

export async function retireLabel(id: string): Promise<void> {
  await linearRequest(RETIRE_LABEL, { id });
}

export async function restoreLabel(id: string): Promise<void> {
  await linearRequest(RESTORE_LABEL, { id });
}

function normalizeLabel(l: any): LinearLabel {
  return { id: l.id, name: l.name, color: l.color, retiredAt: l.retiredAt ?? null };
}
