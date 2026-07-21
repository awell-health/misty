# Data API

A small, token-guarded REST API over the hills data, intended for reading and
updating **scopes** and **goals** from external clients (e.g. a Claude session).

It deliberately does **not** cover creating/updating/deleting hills — only
reading hills (to look one up by name) plus full CRUD on their scopes and goals.

## Setup

Set a server-side secret (do **not** prefix with `NEXT_PUBLIC_` — that would
ship it to the browser):

```
API_TOKEN=<a long random string>
```

Add it to `.env.local` for local dev and to the Vercel project's environment
variables for production. All requests must send it:

```
Authorization: Bearer <API_TOKEN>
```

Missing/invalid token → `401`. If `API_TOKEN` is not configured on the server →
`503`.

> **Note on the DB:** writes go to the same Firebase Realtime Database and
> namespace (`NEXT_PUBLIC_FIREBASE_DB_PREFIX`) the app uses, so any change made
> through the API shows up live in the UI. The API token guards *this* HTTP
> surface; it does not change the underlying RTDB rules.

## Data shapes

The RTDB stores scopes/goals as id-keyed maps with `order` fields; the API hides
that and returns plain, order-sorted arrays.

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

**Goal** (stored internally as a `timelineProject`)

```jsonc
{
  "id": "uuid",
  "name": "string",
  "color": "#1a7f37",
  "date": 1710000000000,  // epoch MILLISECONDS — absolute calendar date
  "order": 0
}
```

## Endpoints

All paths are under `/api/v1`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/hills` | List all hills (each with nested `scopes` + `goals`) |
| GET | `/hills?name=foo` | Same, filtered by case-insensitive title substring |
| GET | `/hills/:id` | One hill with nested `scopes` + `goals` |
| GET | `/hills/:id/scopes` | Scopes for a hill |
| POST | `/hills/:id/scopes` | Create a scope |
| PATCH | `/hills/:id/scopes/:scopeId` | Update a scope |
| DELETE | `/hills/:id/scopes/:scopeId` | Delete a scope |
| GET | `/hills/:id/goals` | Goals for a hill |
| POST | `/hills/:id/goals` | Create a goal |
| PATCH | `/hills/:id/goals/:goalId` | Update a goal |
| DELETE | `/hills/:id/goals/:goalId` | Delete a goal |

Unknown hill/scope/goal → `404`. Invalid JSON or missing required fields →
`400`.

### Create scope — `POST /hills/:id/scopes`

```jsonc
// Required: name. Everything else is optional.
{ "name": "Auth flow", "description": "", "position": 0, "color": "#0969da", "goalPosition": 0.8, "hidden": false }
```

The server assigns `id` and `order` (append to end), and picks a cycling color
if `color` is omitted. Returns `201 { "scope": { ... } }`.

### Update scope — `PATCH /hills/:id/scopes/:scopeId`

Send only the fields you want to change. Accepted: `name`, `description`,
`position`, `color`, `order`, `hidden`, `goalPosition` (send `null` to clear),
`completed`. Setting `completed` also sets/clears `completedAt` automatically.
`position` and `goalPosition` are clamped to `[0, 1]`.

### Create goal — `POST /hills/:id/goals`

```jsonc
// All optional. date is epoch ms; defaults to ~45 days from now.
{ "name": "Beta launch", "color": "#8250df", "date": 1712000000000 }
```

### Update goal — `PATCH /hills/:id/goals/:goalId`

Accepted: `name`, `color`, `date` (epoch ms), `order`.

## Examples (curl)

```bash
BASE=http://localhost:3000/api/v1
AUTH="Authorization: Bearer $API_TOKEN"

# Find a hill by name
curl -s -H "$AUTH" "$BASE/hills?name=payments"

# List its scopes
curl -s -H "$AUTH" "$BASE/hills/$HILL_ID/scopes"

# Create a scope
curl -s -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"Refund handling"}' "$BASE/hills/$HILL_ID/scopes"

# Move a scope up the hill
curl -s -X PATCH -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"position":0.6}' "$BASE/hills/$HILL_ID/scopes/$SCOPE_ID"

# Delete a scope
curl -s -X DELETE -H "$AUTH" "$BASE/hills/$HILL_ID/scopes/$SCOPE_ID"

# Create a roadmap goal dated 2026-09-01
curl -s -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"GA release","date":1756684800000}' "$BASE/hills/$HILL_ID/goals"
```
