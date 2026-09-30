# Linear-connected hills

A hill can optionally be connected to a Linear project. The point is **not** to
sync progress: it is to stop people writing the same scope twice and hunting for
its status in two places.

Linear supplies evidence. Misty supplies the judgement. Nothing in this
integration ever moves a dot on the hill.

## The shape of it

Connecting a hill creates one **label group in Linear named after the hill**
(`Hill: <title>`), with one child label per scope. Misty owns that group and
everything inside it — which is the whole safety argument for syncing without
asking first: no human authors labels in that namespace, so automatic writes
can't clobber anyone's work.

Tag tickets with those labels at whatever granularity is useful. Misty reads
them back and shows counts under each scope:

```
Registry sync
12 issues ↗ · 7 done · 3 in progress · blocked by Auth
```

The dot on the hill stays where a human dragged it. If the counts and the dot
disagree, that's the conversation the row exists to start.

## Setup

Set a server-side key (do **not** prefix with `NEXT_PUBLIC_` — that would ship
it to the browser):

```
LINEAR_API_KEY=lin_api_...
```

Add it to `.env.local` for local dev and to the Vercel project's environment
variables for production. Without it the integration is simply absent: no
"Connect to Linear" button, and every hill behaves exactly as it did before.

The key needs read access plus label create/update. Both a personal API key and
an OAuth token work.

## What Misty writes to Linear

Only inside the hill's own label group. Nothing else in the workspace is
touched, ever.

| In Misty | In Linear |
|---|---|
| hill connected | create group, one child label per existing scope |
| scope created | create child label |
| scope renamed | rename child label (debounced) |
| scope colour changed | set label colour |
| scope deleted | **retire** child label |
| scope moved to another hill | reparent into the target hill's group, if it's connected |
| hill renamed | rename group |
| scope hidden / completed | nothing — display and judgement, not structure |
| hill archived | nothing (hills come back) |
| hill disconnected | nothing — the link is dropped, Linear is left alone |

**Nothing ever deletes a label.** Deleting is irreversible and strips the label
off every issue carrying it. Retiring keeps it on those issues and in every
filter, view and insight; it just can't be applied to anything new. Undoing a
scope deletion restores the same label rather than making a new one, so the
tickets tagged with it stay tagged.

## Sync is reconciliation, not events

Nothing mirrors individual edits. On connect, on any scope change, and on each
hill page load, Misty reads the group's children, diffs them against the hill's
scopes by stored label id, and applies the difference. That means:

- A failed write heals on the next pass instead of leaving a permanent gap.
- A Linear outage never blocks an edit in Misty. The RTDB write succeeds and the
  label catches up.
- Editing via the data API or from another browser triggers a sync too.

Two consequences worth knowing:

- **Misty owns the names inside its group.** Rename a label there by hand and
  the next reconcile puts it back. Rename the scope instead.
- **Connecting to an existing group adopts its children as scopes.** That is the
  Linear-first workflow: build the labels first, then connect. Adoption happens
  only at connect time — otherwise deleting a scope would resurrect it from its
  own label.

If the stored group id stops resolving — the group was deleted, or the hill was
disconnected and reconnected — Misty looks the group up by name before creating
one. Creating blindly would fail forever on the duplicate name, leaving the hill
permanently unable to sync.

Labels in the group that no scope claims are left alone in steady state. The
reconciler can't tell a deleted scope from a label someone added by hand, and
guessing wrong either way is worse than an orphan label sitting there.

## Choices worth knowing about

**The group is single-select, because multi-select doesn't work here.** Linear's
GraphQL schema exposes a `multiSelect` group type, but this workspace rejects it
outright — `issueLabelCreate` fails with *"multi-select issue label groups
disabled"* and no group is created. Linear's own help docs agree with the
workspace and not the schema: they state that only one label per group can be
applied to an issue.

Multi-select would be the better choice if it were available. Single-select
fails silently: someone with a genuinely cross-cutting ticket can't tag both
scopes, so they tag one arbitrarily or neither, and the signal quietly degrades.
Multi-select would double-count that ticket instead, which is visible and
harmless in a gut-check number.

If the workspace ever allows it, `groupType` in `createLabelGroup()` is the only
line that has to change — `buildSignals()` already counts an issue under every
scope label it carries.

**Label names must be unique across the whole workspace.** Not within a group —
across everything. Linear's own docs say the opposite ("labels in different
groups, including child labels with the same name, remain separate labels"), and
the API disagrees: creating a child called `Platform` fails with *"duplicate
label name"* if any label anywhere in the workspace already has that name,
grouped or not. Team-scoping the label does not relax it either. Both were
verified directly against the API.

This matters because scope names are short common words and the workspace
already owns `Bug`, `Platform`, `Product`, `Now`, `Next`, `Later`, `QA` and
`Tech Debt`. So a scope's label is created under the plain name where it can be,
and qualified with the hill where it can't — `Platform` becomes
`Platform (M2 Registry)`. The reconciler treats either form as correct, so it
stays a no-op once settled rather than trying to rename back forever.

Two hills with a scope of the same name is the other case this covers: the
first one gets the plain name, the second gets a qualified one.

**The group is created at workspace level, not team level.** A label's team
can't be changed after creation, so this is the one irreversible choice here —
worth taking the option that can't box us in when a project later spans teams.
The cost is a group per hill in workspace label settings; the `Hill:` prefix
keeps them sorted together.

**Retired ≠ archived.** Linear has both. `issueLabelRetire` is the one that
matches "stop using this but keep the history"; generic archival is a different
thing. The client comments call this out because it is easy to get wrong.

## Endpoints

Internal routes for the app's own UI, under `/api/linear`. Unlike `/api/v1`,
they carry no bearer token — see the caveat below.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/projects` | Projects + milestones for the connect picker |
| GET | `/hills/:id` | The read-only signal for a hill |
| POST | `/hills/:id` | Connect. Body: `{ projectId, milestoneId? }` |
| DELETE | `/hills/:id` | Disconnect (leaves Linear untouched) |
| POST | `/hills/:id/sync` | Reconcile now (idempotent) |
| POST | `/hills/:id/labels` | `{ action: 'retire' \| 'move', labelId, toHillId? }` |

`GET /hills/:id` never fails the page: an unreachable Linear returns a
well-formed payload with no scopes, and the hill renders as it always has. Hills
get projected in planning meetings, so that matters more than surfacing an error.

### Security caveat

These routes are unauthenticated, matching the existing `/api/ooo-calendar` and
`/api/oncall-calendar` routes. Those are read-only; these are not. Anyone who
can reach the deployment can create or rename labels inside a Misty-owned group
in Linear.

The blast radius is bounded — writes are confined to `Hill: *` groups, nothing
is ever deleted, and retiring is reversible — but it is a real new write path
into Linear, and worth closing if Misty ever grows a real session.
