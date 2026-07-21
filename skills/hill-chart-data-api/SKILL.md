---
name: hill-chart-data-api
description: Read and update Hill Chart data (hills, scopes, and roadmap goals) over its REST API. Use when the user wants to look up a hill by name, pull scopes or roadmap goals for context, or create/update/delete scopes and goals in the Hill Chart app.
---

# Hill Chart Data API

A token-guarded REST API over the Hill Chart app's data. It lets you look up
hills, read their scopes and roadmap goals for context, and collaborate on
scopes and goals (create / update / delete).

It does **not** create, update, or delete hills — only read them.

## Configuration (required before any call)

Two values must be supplied by the user. **Never guess them; ask if missing.**

- `BASE_URL` — the app's origin plus `/api/v1`, e.g. `https://<app-host>/api/v1`
- `API_TOKEN` — the server's bearer token

Every request needs the header:

```
Authorization: Bearer <API_TOKEN>
```

If you don't already have both values, ask the user for them before making any
request. Do not hardcode or invent them.

Response codes: `401` (missing/invalid token), `503` (server has no token
configured), `404` (unknown hill/scope/goal), `400` (bad JSON or missing
required field).

## Data shapes

The API returns plain, order-sorted arrays (the storage-level id maps and
`order` bookkeeping are hidden).

**Scope**

```jsonc
{
  "id": "uuid",
  "name": "string",
  "description": "string",
  "position": 0.0,        // 0 = start (left), 0.5 = hilltop, 1 = done (right)
  "color": "#1a7f37",
  "order": 0,
  "hidden": false,
  "goalPosition": 0.5,    // optional target position on the hill
  "completed": false,
  "completedAt": 1710000000000
}
```

**Goal** (a dated roadmap item; stored internally as a `timelineProject`)

```jsonc
{
  "id": "uuid",
  "name": "string",
  "color": "#1a7f37",
  "date": 1710000000000,  // epoch MILLISECONDS — absolute calendar date
  "order": 0
}
```

## Workflow

1. **Find the hill.** You almost always start from a hill name, not an id.
   Fetch and filter by name, then use the returned `id` for everything else.
2. **Read for context.** Pull the hill's scopes and/or goals before proposing
   changes.
3. **Write.** Create/update/delete scopes or goals. Changes sync live into the
   app UI, so confirm intent with the user before deleting or making bulk
   edits.

## Endpoints

All paths are relative to `BASE_URL`. Examples use these shell variables:

```bash
BASE_URL="https://<app-host>/api/v1"   # provided by the user
API_TOKEN="<token>"                    # provided by the user
AUTH="Authorization: Bearer $API_TOKEN"
```

### Find a hill by name

```bash
curl -s -H "$AUTH" "$BASE_URL/hills?name=payments"
```

Returns `{ "hills": [ { id, title, description, ..., scopes: [...], goals: [...] } ] }`.
The `name` filter is a case-insensitive substring match on the title. Omit it to
list every hill. Each hill already includes its nested `scopes` and `goals`, so
this one call is often enough for context.

Fetch a single hill by id:

```bash
curl -s -H "$AUTH" "$BASE_URL/hills/$HILL_ID"
```

### Scopes

```bash
# List
curl -s -H "$AUTH" "$BASE_URL/hills/$HILL_ID/scopes"

# Create — only `name` is required; server assigns id, order, and a color
curl -s -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"Refund handling"}' "$BASE_URL/hills/$HILL_ID/scopes"

# Update — send only the fields to change
curl -s -X PATCH -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"position":0.6}' "$BASE_URL/hills/$HILL_ID/scopes/$SCOPE_ID"

# Delete
curl -s -X DELETE -H "$AUTH" "$BASE_URL/hills/$HILL_ID/scopes/$SCOPE_ID"
```

Create body accepts: `name` (required), `description`, `position`, `color`,
`goalPosition`, `hidden`.

Update (PATCH) accepts any of: `name`, `description`, `position`, `color`,
`order`, `hidden`, `goalPosition` (send `null` to clear it), `completed`.
Setting `completed` also sets/clears `completedAt` automatically. `position` and
`goalPosition` are clamped to `[0, 1]`.

### Goals (roadmap items)

```bash
# List
curl -s -H "$AUTH" "$BASE_URL/hills/$HILL_ID/goals"

# Create — all fields optional; date defaults to ~45 days out
curl -s -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"Beta launch","date":1756684800000}' "$BASE_URL/hills/$HILL_ID/goals"

# Update
curl -s -X PATCH -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"GA release"}' "$BASE_URL/hills/$HILL_ID/goals/$GOAL_ID"

# Delete
curl -s -X DELETE -H "$AUTH" "$BASE_URL/hills/$HILL_ID/goals/$GOAL_ID"
```

Create body accepts: `name`, `color`, `date` (epoch ms). Update (PATCH)
accepts: `name`, `color`, `date` (epoch ms), `order`.

## Notes

- `date` is **epoch milliseconds**. To set a calendar date, convert it first
  (e.g. `2026-09-01` → `1756684800000`).
- `position` on a scope is progress on the hill: `0` not started, `0.5` at the
  top (hardest unknowns solved), `1` done. `goalPosition` is a target marker.
- Writes are immediate and appear live in the app for anyone viewing it.
  Confirm before deleting or making sweeping changes.
