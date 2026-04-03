# BCC Team Manager — AI Agent Context Summary

## 1. Project Overview

BCC Team Manager is a backend system for managing Bengaluru Comic Con volunteer coordination.

- **Client:** Bengaluru Comic Con
- **Purpose:** Manage yearly volunteer events — teams, participants, scoring, leaderboard
- **Constraint:** Must run entirely on free-tier infrastructure
- **Deployment Target:** Deno Deploy (serverless) or Fly.io

---

## 2. Tech Stack

### Backend

- **Runtime:** Deno
- **Framework:** Hono (REST API)
- **Language:** TypeScript
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth (Google OAuth + email/password for testing)
- **JWT:** ES256 via JWKS (`jose` library)
- **Email:** Brevo HTTP API
- **Validation:** Zod v4 (`@zod/zod` from JSR)

### Frontend (separate project)

- React, TanStack Router, TanStack Query, React Hook Form + Zod, Tailwind CSS, Base UI, TypeScript, Vite

---

## 3. Database Schema

### `years`

- id (uuid, pk)
- name (text, unique)
- year (int)
- is_locked (boolean)
- created_at

### `teams`

- id (uuid, pk)
- name (text)
- year_id (uuid, fk → years.id)
- created_at
- UNIQUE (year_id, name)

### `profiles`

- id (uuid, pk, fk → auth.users.id)
- global_role (viewer | user | admin | superadmin)
- previous_role (text, nullable, CHECK same enum as global_role) — stores prior role before ban demotion
- name (text, nullable)
- email (text, nullable)
- created_at

### `year_participants`

- id (uuid, pk)
- year_id (uuid, fk → years.id)
- user_id (uuid, nullable, fk → auth.users.id)
- name (text)
- email (text)
- mobile (text)
- reg_id (text, nullable)
- banned (boolean)
- disqualified (boolean)
- created_at
- UNIQUE (year_id, email)

### `team_memberships`

- id (uuid, pk)
- team_id (uuid, fk → teams.id)
- year_participant_id (uuid, fk → year_participants.id)
- is_team_lead (boolean)
- UNIQUE (year_participant_id)
- UNIQUE (team_id) WHERE is_team_lead = true

### `tasks`

- id (uuid, pk)
- title (text)
- year_id (uuid, nullable)
- team_id (uuid, nullable)
- max_base_score (int)
- created_at

### `score_events`

- id (uuid, pk)
- task_id (uuid, fk → tasks.id)
- year_participant_id (uuid, fk → year_participants.id)
- event_type (base | gold | silver | bronze | bonus)
- value (int)
- created_by (uuid, fk → auth.users.id)
- is_deleted (boolean, default false) ← soft delete, set to true when participant is banned
- created_at

### `audit_logs`

- id (uuid, pk)
- actor_id (uuid)
- action (text)
- entity_type (text)
- entity_id (uuid)
- before (jsonb)
- after (jsonb)
- created_at

### `year_access`

- id (uuid, pk)
- user_id (uuid, fk → auth.users.id)
- year_id (uuid, fk → years.id)
- status (text: pending | approved | rejected)
- created_at
- UNIQUE INDEX on (user_id, year_id) WHERE status != 'rejected'

---

## 4. RBAC System

### Roles (stored in profiles.global_role)

- **viewer** — read-only, masked data, needs year_access approval
- **user** — team lead, can score/manage own team participants
- **admin** — full control within a year
- **superadmin** — full system-wide control

### Role Hierarchy

viewer < user < admin < superadmin

### Middleware Chain (in order)

1. `supabaseAuth` — verifies JWT, sets userId, email, name on context
2. `loadProfile` — fetches profile from DB, sets global_role on context
3. `requireRole(minRole)` — enforces minimum role
4. `requireYearAccess` — checks year_access table for viewer/user roles (admin+ bypass)

---

## 5. Key Business Rules

### Years

- Immutable after is_locked = true
- Only superadmin can create years
- Admin can lock years
- Only one active (unlocked) year allowed at a time — creating a new year is blocked if any existing year is unlocked (409 error)

### Teams

- Unique per year
- No deletion allowed
- Only admin+ can create/update teams

### Participants (year_participants)

- Scoped per year, identified by (year_id + email)
- user_id is nullable — most volunteers don't have app accounts
- banned = permanent across all years (enforced at registration)
- disqualified = scoped to current year only, affects leaderboard
- Volunteers only (user_id = null) appear on leaderboard
- Team leads, admins, superadmins are also year_participants but excluded from leaderboard

### Participant Listing

- Two separate endpoints — year view (paginated) and team view (non-paginated)
- Year view: `GET /years/:yearId/participants` — 50 per page, default sort: name asc, volunteers only (`.is('user_id', null)`)
- Team view: `GET /years/:yearId/teams/:teamId/participants` — all records, sorted by name, volunteers only (`.is('user_id', null)`)
- Both accessible by any authenticated user with approved year_access
- Shared utility functions in `src/utils/participants.ts`:
  - `getRequesterTeam(userId, yearId)` — finds requester's team via year_participants → team_memberships join
  - `applyPrivacyMask(participant, canSeePII)` — redacts email/mobile, flattens team_memberships join

### Participant Listing — Banned and Disqualified Rules

- **Banned participants** — excluded from both year view and team view entirely
  - Separate admin-only page (within year) for viewing and managing banned participants
- **Disqualified participants** — included in both views (visible in general list)
  - Separate admin-only page (within year) for viewing and managing disqualified participants
  - Admin can undisqualify a participant via that page

### Participant Listing — Filtering and Sorting (Year View)

- Sorting and filtering must happen at DB level (pagination makes client-side filtering incorrect)
- Team view has no pagination — sorting and filtering handled client-side by TanStack Table, no API changes needed

#### Query Params for Year View (`GET /years/:yearId/participants`)

| Param  | Type              | Allowed For | Default | Notes                                                 |
| ------ | ----------------- | ----------- | ------- | ----------------------------------------------------- |
| page   | number            | All         | 1       | 50 records per page                                   |
| sort   | `name` \| `email` | See below   | `name`  | `email` sort silently ignored for viewer/user         |
| order  | `asc` \| `desc`   | All         | `asc`   |                                                       |
| name   | string            | All         | —       | Contains search, case-insensitive (`ilike '%value%'`) |
| email  | string            | Admin+ only | —       | Contains search, silently ignored for viewer/user     |
| mobile | string            | Admin+ only | —       | Contains search, silently ignored for viewer/user     |

#### Filter Strategy

- Filter method: `.ilike('field', '%value%')` — contains, case-insensitive — for all filter fields
- Chosen over starts-with (`ilike 'value%'`) because: at BCC's volunteer scale (100–500/year), the sequential scan cost is negligible, and contains gives significantly better UX (searching "kumar" finds "Anil Kumar", "Vikram Kumar" etc.)
- Role enforcement for restricted params is done in the **service layer** — restricted params are silently ignored based on role, not rejected with 403
  - Rationale: the endpoint itself is accessible to all roles. Only specific params are restricted. 403 would imply the endpoint is forbidden, which is incorrect.
- The API enforces param restrictions independently of the frontend. The frontend may disable restricted filter UI elements for viewer/user roles, but this is a UX concern only — not a security boundary.

### Banning Logic

- Check most recent record for email on registration
- If banned = true → block registration, return banned participant details
- Only admin+ can ban or unban

#### Ban Flow — Regular Volunteer (`user_id = null`)

1. Fetch participant — verify exists, belongs to `yearId`, not already banned
2. Set `banned = true` on `year_participants`
3. Delete `team_membership` if exists
4. Soft delete `score_events` — set `is_deleted = true`

#### Ban Flow — Team Lead (`user_id` not null, `global_role === 'user'`)

1. Fetch participant — verify exists, belongs to `yearId`, not already banned
2. Disable Supabase account first via Admin API: `updateUserById(userId, { ban_duration: '876000h' })`
   - If this fails — throw immediately, no DB changes made (Option A: fail fast)
3. Call Supabase RPC function atomically for all DB changes:
   - Set `banned = true` on `year_participants`
   - Set `profiles.global_role` to `viewer`
   - Delete `team_membership`
   - Delete current year `year_access` record only (historical records for other years are preserved)
4. If RPC fails — log error, return partial success with what succeeded vs failed

#### Unban Flow — All Participants

Two modes controlled by optional `restoreAccess` query param:

**Mode 1 — Basic Pardon (`restoreAccess` not provided or false):**

1. Fetch participant — verify exists, is actually banned
2. If `user_id` exists — re-enable Supabase account: `updateUserById(userId, { ban_duration: 'none' })`
   - If auth API fails — throw immediately
3. Call `unban_participant` RPC — sets `banned = false`, restores `score_events` (`is_deleted = false`)
   - If RPC fails for volunteer (no user_id) — throw 500
   - If RPC fails for team lead (user_id exists) — return partial success `{ success: false, auth_restored: true, db_updated: false }`
4. Return updated participant — role stays as `viewer`, no year_access created
5. No team re-assignment — admin manually adds them back

**Mode 2 — Full Reinstatement (`restoreAccess=true`, only for team leads with `user_id`):**

1. Same steps 1–4 as Mode 1
2. Additionally call `restore_team_lead_access` RPC:
   - Restores `profiles.global_role` from `previous_role`
   - Clears `previous_role` to null
   - Creates `year_access` for current year with `status: approved`
   - If RPC fails — return partial success with `restoredCompleteAccess: false`
3. Team assignment still manual — admin assigns to team explicitly

**Pardon vs Reinstatement principle:**

- Basic unban = "pardon" — lifts ban flag and restores scores only
- Full reinstatement = conscious admin decision to restore role and access
- Prevents window where former team lead has management access before admin intends
- Follows Principle of Least Privilege

**Response shape:**

```json
{
  "success": boolean,
  "auth_restored": boolean,
  "restoredCompleteAccess": boolean,
  "db_updated": boolean,
  "data": participant | null
}
```

### Disqualification Logic

- Check most recent record for email on registration
- If disqualified = true → allow registration but return warning in response
- Disqualification only applies to volunteers (`user_id = null`) — team leads cannot be disqualified
- Disqualify only allowed on unlocked years
- `disqualified = true` — participant stays in team, scores preserved but excluded from leaderboard
- Team dashboard shows disqualified participants with visual indicator (frontend concern)
- Undisqualify: sets `disqualified = false` on current year record (admin+ only, unlocked year only)

### Scoring

- base: 0–10
- gold: +5, silver: +3, bronze: +2, bonus: +1
- Only 1 medal per participant per task
- Bonus can stack
- Admin can edit base score only

### Team Memberships

- Team lead can only assign unassigned participants to their own team
- Admin+ can assign any participant to any team
- Moving a participant between teams (admin+ only):
  - Regular participant → scores transfer to new team, old membership removed
  - Team lead → loses is_team_lead on old team, becomes regular participant on new team
  - Moved team lead retains `user` role and portal access but cannot edit any team
  - Admin manually awards one-time bonus score as compensation — no auto-scoring for past tasks
- UI must show confirmation modal before moving any participant

### Year Access Flow

1. User requests access to a year → year_access record (status: pending)
2. Max 3 requests per user per year (rejected records count)
3. Admin approves → status: approved (viewer access)
4. Admin can promote viewer → user (team lead) — via separate promotion dashboard
5. Admin/superadmin can promote user → admin, superadmin can promote admin → superadmin — via same dashboard

### Role Promotion & Demotion Rules

#### Promotion/Demotion Dashboard

- Separate dashboard outside of year context — accessible to admin and superadmin
- Admin can: promote viewer → user (team lead), demote user → viewer, promote viewer/user → admin
- Superadmin can: do everything admin can + promote/demote to/from admin and superadmin
- Role change is always global (updates `profiles.global_role`) — not year-scoped

#### Viewer → Team Lead (user role) Promotion

- global_role updated to `user`
- If the viewer has an approved year_access for the most recent year (by created_at) → create year_participant record for that year only
- year_participant created with no team assignment — they are a year participant, not yet a team lead
- Team assignment is a separate explicit action by admin — which creates team_membership with is_team_lead = true
- If no approved year_access exists at promotion time → no year_participant created; created when assigned to a team

#### Team Lead (user) → Admin Promotion

- global_role updated to `admin`
- Remove team_membership record for current year (team leads have no scores, safe to delete)
- Remove year_participant record for current year
- No year_access changes needed — admins bypass year_access checks

#### Team Lead (user) → Viewer Demotion (full demotion)

- global_role updated to `viewer`
- Remove team_membership record for current year
- Remove year_participant record for current year

#### Team Lead → Regular Participant (within same year, no global role change)

- is_team_lead set to false on team_membership — they remain in the same team as a regular member
- global_role stays as `user`
- Separate explicit action required to remove them from team entirely

#### Moving a Team Lead to Another Team

- Two cases:
  1. As regular member — old team_membership removed, new team_membership created with is_team_lead = false
  2. As new team lead — old team_membership removed, new team_membership created with is_team_lead = true
     - Blocked if target team already has a team lead — admin must remove existing team lead first
     - DB constraint `UNIQUE (team_id) WHERE is_team_lead = true` enforces this at DB level
     - Service layer catches this before hitting DB and returns meaningful error (409)
- global_role stays as `user` in all move scenarios
- Admin manually awards one-time bonus score for prior team lead contribution — no auto-scoring

#### Removing Year Access

- Removes year_access record
- Also removes team_membership record for that year (if exists)
- Also removes year_participant record for that year (if exists)
- Safe to delete — team leads have no score_events against them; viewers are not year_participants

---

## 6. Privacy Model

- email, mobile visible to: admin+, same team lead, self
- All others see masked/null values
- Enforced in backend service layer, not DB RLS

---

## 7. API Structure

### Routes

```
/profile
  POST /bootstrap         — create/update profile from JWT (any authed user)
  GET  /me                — get own profile

/years
  POST /                  — create year (superadmin)
  GET  /                  — get all years with access status (any authed user)
  POST /:yearId/lock      — lock year (admin+)
  POST /:yearId/participants       — add single participant (admin+)
  POST /:yearId/participants/bulk  — bulk CSV upload (admin+)
  GET  /:yearId/participants               — paginated volunteer list (any with year access)
  GET  /:yearId/teams/:teamId/participants — team volunteer list (any with year access)
  GET  /:yearId/team-leads                 — all team leads incl. banned (admin+)

/teams (additional)
  POST /year/:yearId/copy                  — copy teams from previous year (admin+, body: { teamIds })
  PATCH /:yearId/participants/:id/ban      — ban participant (admin+)
  PATCH /:yearId/participants/:id/unban    — unban participant (admin+)
  PATCH /:yearId/participants/:id/disqualify   — disqualify participant (admin+)
  PATCH /:yearId/participants/:id/undisqualify — undisqualify participant (admin+)

/teams
  POST /create            — create team (admin+)
  GET  /                  — get teams by yearId query param (any authed)
  PATCH /:teamId          — update team name (admin+)

/year-access
  POST /                  — request year access (any authed, yearId as query param)
  GET  /                  — get all requests grouped by status (admin+, yearId as query param)
  PATCH /:id/approve      — approve request (admin+)
  PATCH /:id/reject       — reject request (admin+)
```

### Planned Routes (not yet built)

```
/team-memberships
  POST /                  — assign participant to team
  PATCH /:id/move         — move participant to another team (admin+)
  PATCH /:id/demote       — demote team lead to regular member within same team (admin+)
  DELETE /:id             — remove participant from team (admin+)

/years (additional)
  GET  /:yearId/participants               — paginated volunteer list (any with year access)
  GET  /:yearId/teams/:teamId/participants — team volunteer list (any with year access)
  GET  /:yearId/team-leads                 — staff dashboard, all team leads incl. banned (admin+)
  PATCH /:yearId/participants/:id/ban      — ban participant (admin+)
  PATCH /:yearId/participants/:id/unban    — unban participant (admin+)
  PATCH /:yearId/participants/:id/disqualify   — disqualify participant (admin+)
  PATCH /:yearId/participants/:id/undisqualify — undisqualify participant (admin+)

/year-access (additional)
  DELETE /:id             — remove year access, cleans up team_membership and year_participant (admin+)

/roles (promotion/demotion dashboard — outside year context)
  GET    /users           — list all users with their global_role (admin+)
  PATCH  /:userId/promote — promote user role (admin promotes up to admin, superadmin up to superadmin)
  PATCH  /:userId/demote  — demote user role (same permission rules as promote)
```

---

## 8. Validation Pattern

Custom `validate` middleware wraps `@hono/zod-validator`:

```ts
// Usage in routes
validate('json', schema); // request body
validate('query', schema); // query params
validate('param', schema); // URL params

// Access validated data in handler
const data = getValidated(c, 'json', schema);
```

### Schema Files

- `src/schemas/common.schema.ts` — `uuidSchema`, `nameSchema` (min 5, max 50, trimmed)
- `src/schemas/years.schema.ts` — `createYearSchema`, `lockYearSchema`
- `src/schemas/teams.schema.ts` — `createTeamSchema`, `getTeamsSchema`, `updateTeamNameSchema`, `updateTeamNameParamsSchema`
- `src/schemas/year_participants.schema.ts` — `yearParticipantsSchema`, `yearParticipantsParamsSchema`, `getYearParticipantsQuerySchema`, `getTeamParticipantsParamsSchema`
- `src/schemas/year_access.schema.ts` — `requestYearAccessSchema`, `approveRejectYearAccessSchema`

#### `getYearParticipantsQuerySchema` params

- `page` — string → parsed to int, min 1, default 1
- `name` — optional string, trimmed (contains filter, all roles)
- `email` — optional string, trimmed (contains filter, admin+ only — silently ignored for viewer/user)
- `mobile` — optional string, trimmed (contains filter, admin+ only — silently ignored for viewer/user)
- `sort` — `'name' | 'email'`, default `'name'` (`'email'` silently ignored for viewer/user)
- `order` — `'asc' | 'desc'`, default `'asc'`

#### `getTeamParticipantsParamsSchema` params

- `yearId` — UUID
- `teamId` — UUID

---

## 9. Error Handling

### AppError Class

```ts
new AppError(message, ERROR_CODE, httpStatus, data?)
```

### Response Shape

```json
{
  "error": "human readable message",
  "error_code": "MACHINE_READABLE_CODE",
  "data": {} // optional, only for specific errors like PARTICIPANT_BANNED
}
```

### Key Error Codes

See `src/constants/error-codes.ts` for full list. Key ones:

- UNAUTHORIZED, FORBIDDEN
- VALIDATION_ERROR (422 for Zod failures)
- YEAR_NOT_FOUND, YEAR_ALREADY_LOCKED
- TEAM_EXISTS, TEAM_NOT_FOUND
- PARTICIPANT_BANNED, YEAR_PARTICIPANT_ALREADY_EXISTS
- YEAR_ACCESS_FETCH_FAILED, YEAR_ACCESS_REQUEST_FAILED
- REQUEST_ATTEMPTS_EXCEEDED (429)
- INTERNAL_SERVER_ERROR

---

## 10. Bulk Participant Upload

- Endpoint: `POST /years/:yearId/participants/bulk`
- Format: CSV only (multipart/form-data, field name: `file`)
- Strategy: Partial success — returns succeeded and failed rows
- Flow:
  1. Parse CSV via `@std/csv` with `skipFirstRow: true`
  2. Loop 1 — Zod validate each row, collect validRows and failed
  3. Single DB query — `.in('email', validEmails)` for ban/disqualify checks
  4. Build lookup map (email → most recent record)
  5. Loop 2 — ban check, duplicate check, disqualify warning
  6. Hybrid insert — bulk first, fallback to one-by-one on 23505
  7. Return `{ succeeded: BulkSucceededRow[], failed: BulkFailedRow[] }` with status 207

---

## 11. Year Access Request Grouping

`GET /year-access?yearId=xxx` returns:

```json
{
  "pending": [{ id, user_id, year_id, status, name, email, previous_rejections }],
  "approved": [{ id, user_id, year_id, status, name, email }],
  "rejected": [{ user_id, year_id, status, name, email, rejection_count, last_rejected_at }]
}
```

- User details (name, email) fetched via Supabase Admin API `listUsers` (perPage: 1000)
- Grouped in memory — one DB call + one Auth API call
- Rejected entries aggregated — one per user with count

---

## 12. Constants

- `MAX_YEAR_REQUEST_ATTEMPTS = 3` — in `src/constants/common.ts`

---

## 13. What's Done

- Auth middleware (supabaseAuth, loadProfile, requireRole, requireYearAccess)
- Profile bootstrap and fetch
- Years — create, lock, get all with access status
  - `createYear` returns `{ createdYear, previousYearId }` — `previousYearId` is most recent other year by `created_at` desc, null if none exists
- Years — creation guard: blocked if any unlocked year exists (checks is_locked = false OR is_locked is null, returns 409 with unlocked_years list)
- Teams — create, get, update
- Year participants — single add, bulk CSV upload
- Year access — request, approve, reject, get all requests
- Participants service design — privacy masking, shared utilities, pagination strategy
- Participant listing design — filtering, sorting, role-based param enforcement, filter method (ilike contains)
- Role promotion/demotion flows — all scenarios designed and locked
- Zod schemas — `getYearParticipantsQuerySchema`, `getTeamParticipantsParamsSchema` added to `year_participants.schema.ts`
- Shared utilities — `getRequesterTeam`, `applyPrivacyMask` built in `src/utils/participants.ts`
- `getYearParticipants` service — built in `src/services/year_participants.ts` (`.is('user_id', null)` applied — volunteers only)
- `GET /years/:yearId/participants` route — built in `year_participants.routes.ts`
- Ban flow — `banParticipant`, `banVolunteer`, `banTeamLead` built in services/utils
- Unban flow — `unbanParticipant` built with Pardon vs Reinstatement pattern
- Supabase RPC functions — `ban_team_lead`, `unban_participant`, `restore_team_lead_access` created
- `PATCH /:participantId/ban` and `PATCH /:participantId/unban` routes built
- `disqualifyParticipant` service built — year lock check, team lead guard, sets `disqualified=true`
- `undisqualifyParticipant` service built — year lock check, checks participant is disqualified, sets `disqualified=false`
- `PATCH /:participantId/disqualify` and `PATCH /:participantId/undisqualify` routes built
- Both reuse `yearParticipantsBanParamsSchema` for params validation
- `getTeamLeadsForYear` service built — fetches all year_participants where user_id IS NOT NULL including banned, left join team_memberships, flattened response
- `GET /years/:yearId/team-leads` route built — admin+ only, reuses yearId param schema, returns all team leads including banned
- `copyTeamsToYear` service built — validates year exists and not locked, fetches source teams by IDs, skips duplicates by name (case-insensitive), bulk inserts remaining, returns `{ created, skipped }`
- `POST /teams/year/:yearId/copy` route built — admin+ only, body: `{ teamIds: uuid[] }` via `teamIdsParamsSchema`
- `teamIdsParamsSchema` added to teams schema file — `z.array(uuidSchema).min(1)`
- `createYear` updated — returns `{ createdYear, previousYearId }` where `previousYearId` is most recent other year

### `getRequesterTeam` — `src/utils/participants.ts`

- Args: `{ userId, yearId, role }`
- admin/superadmin → returns `{ teamId: null, canSeePII: true }` — no DB call
- viewer → returns `{ teamId: null, canSeePII: false }` — no DB call
- user (team lead) → queries `year_participants` joined with `team_memberships`, selects `team_id` and `is_team_lead`
  - No year_participant found → `{ teamId: null, canSeePII: false }`
  - No team_membership found → `{ teamId: null, canSeePII: false }`
  - Membership found → `{ teamId: membership.team_id, canSeePII: membership.is_team_lead }`
- Throws `TEAM_MEMBERSHIP_FETCH_FAILED` (500) on DB error
- Fallback return `{ teamId: null, canSeePII: false }` for TypeScript exhaustiveness

- `getTeamYearParticipants` service — built in `src/services/team_participants.ts` (`.is('user_id', null)` applied — volunteers only)
- `GET /years/:yearId/teams/:teamId/participants` route — built in `team_participants.routes.ts`, mounted at `/:yearId/teams` in `years.routes.ts`

### `getTeamYearParticipants` service — `src/services/team_participants.ts`

- Args: `{ yearId, teamId, userId, role }`
- Calls `getRequesterTeam` to get `canSeePII`
- Queries `year_participants` with `team_memberships!inner` join — only participants with a membership record
- Filters by `team_memberships.team_id = teamId` and `year_id = yearId`
- Excludes banned via `.or('banned.eq.false,banned.is.null')`
- Hard limit of 50 (safety cap — team sizes won't exceed this)
- Sorted by `name` ascending
- Empty result returns `[]` — not a 404 (valid state for a new team)
- Maps to flat shape: `id, name, email, mobile, reg_id, banned, disqualified, team_membership_id, team_id, is_team_lead`
- Applies `applyPrivacyMask(data, canSeePII)`
- Throws `TEAM_PARTICIPANT_FETCH_FAILED` (500) on DB error

### Scoring — Team View Design Decision (Option B)

- Team participants endpoint returns participant + membership data only
- Scores are a separate endpoint — `GET /years/:yearId/teams/:teamId/scores` — to be built during Phase 4 (Tasks & Scoring)
- Frontend makes two separate TanStack Query calls and combines them in the team dashboard UI
- Keeps each endpoint single-responsibility; scoring system is complex enough to deserve its own endpoint

### `getYearParticipants` service — `src/services/year_participants.ts`

- Args: `{ yearId, userId, role, filters: YearParticipantFilters }`
- Calls `getRequesterTeam` to get `canSeePII`
- Role-based filter stripping — admin+ can filter by email/mobile/name (email > mobile > name priority), viewer/user can only filter by name
- Sort column defaults to `name`; `email` sort only applied for admin+
- Sort direction: `filters.order !== 'desc'` → ascending by default
- Excludes banned participants via `.or('banned.eq.false,banned.is.null')`
- Joins `team_memberships` — selects `id, team_id, is_team_lead`
- Pagination via `.range(from, to)` with `count: 'exact'`
- Maps result to flat shape: `id, team_member_id, name, email, mobile, reg_id, banned, disqualified, team_id, is_team_lead`
- `is_team_lead` defaults to `false` (not null) when no membership
- Applies `applyPrivacyMask(data, canSeePII)`
- Returns `{ participants, total, page, pageSize }`
- Throws `YEAR_PARTICIPANT_FETCH_FAILED` (500) on DB error

### `GET /years/:yearId/participants` route — `year_participants.routes.ts`

- Middleware: `supabaseAuth` → `loadProfile` → `requireRole(Role.Viewer)` → `requireYearAccess`
- Validates params with `yearParticipantsParamsSchema`, query with `getYearParticipantsQuerySchema`
- Pulls `userId` and `role` from context
- Returns 200 with `{ participants, total, page, pageSize }`

### Participant Actions in Year Dashboard (admin/superadmin)

- Regular volunteers: add to team, remove from team, disqualify, ban
- Team leads: move to another team (as member or new lead), demote to regular member, remove from team, disqualify, ban, promote to admin (redirects to roles dashboard)
- Disqualified participants: visible in list, "remove from team" action still available
- All destructive actions require confirmation modal on frontend

### Ban Flow Design (Locked)

#### Regular Volunteer (`user_id = null`)

- Single Supabase RPC call handles all DB changes atomically:
  1. Set `banned = true` on `year_participants`
  2. Soft delete `score_events` — set `is_deleted = true`
  3. Delete `team_membership` if exists
- Ban applies to current year record only — registration check against most recent record enforces permanent ban across years

#### Team Lead (`user_id` not null, `global_role = 'user'`)

- Step 1 — Disable Supabase auth account via Admin API (`ban_duration: '876000h'`) — stop entirely if this fails
- Step 2 — Supabase RPC call handles all DB changes atomically:
  1. Set `banned = true` on `year_participants`
  2. Set `profiles.global_role` to `viewer`
  3. Delete `team_membership`
  4. Delete current year `year_access` record only (historical year_access records preserved)
- If RPC fails after account disable — return partial success `{ account_disabled: true, db_updated: false }` for admin to manually resolve
- Auth API call is outside DB transaction boundary — best effort approach is the correct architecture here

#### Atomicity Strategy

- Supabase JS client has no transaction support on free tier
- DB-only steps wrapped in Postgres RPC function — runs as single transaction on DB side
- Auth API call handled separately before RPC — failure stops the flow before any DB changes
- Partial success surfaced explicitly if DB step fails after auth step succeeds

### Ban & Unban Implementation — Completed

#### Supabase RPC Functions (run in SQL editor)

**`ban_team_lead(p_participant_id, p_user_id, p_year_id)`**

- Atomically: set `banned=true` on year_participants, save `global_role` to `previous_role` then set `global_role='viewer'` on profiles, delete team_membership, delete current year year_access

**`unban_participant(p_participant_id)`**

- Atomically: set `banned=false` on year_participants, set `is_deleted=false` on score_events

**`restore_team_lead_access(p_user_id, p_year_id)`**

- Atomically: restore `global_role` from `previous_role`, clear `previous_role=null`, insert year_access with `status='approved'`
- Raises exception if `previous_role` is null

#### Schemas added to `year_participants.schema.ts`

- `getYearParticipantsBanParamsSchema` — `{ participantId: uuid, yearId: uuid }`
- `yearParticipantsUnbanParamsSchema` — `{ participantId: uuid, yearId: uuid }`
- `yearParticipantsUnbanQuerySchema` — `{ restoreAuth: z.stringbool().optional() }`

#### `banParticipant` service — `src/services/year_participants.ts`

- Fetches participant, filters already-banned via `.or('banned.eq.false,banned.is.null')`
- `user_id = null` → calls `banVolunteer`
- `user_id` exists, `global_role = admin/superadmin` → throws 403
- `user_id` exists, unexpected role → throws 403
- `user_id` exists, `global_role = user` → calls `banTeamLead`

#### `banVolunteer` — `src/utils/participants.ts`

- Updates `banned=true`, deletes team_membership, soft deletes score_events (3 sequential calls)
- Returns updated participant record

#### `banTeamLead` — `src/utils/participants.ts`

- Disables Supabase account: `updateUserById(userId, { ban_duration: '876000h' })` — throws if fails
- Calls `ban_team_lead` RPC — throws if fails
- Returns fetched participant record

#### `unbanParticipant` service — `src/services/year_participants.ts`

- Args: `{ yearId, participantId, restoreCompleteAccess?: boolean }`
- Fetches participant with `.maybeSingle()`, verifies `banned=true`
- If `user_id` exists — re-enables account: `updateUserById(userId, { ban_duration: 'none' })`
- Calls `unban_participant` RPC
  - Volunteer RPC fail → throws 500
  - Team lead RPC fail → returns partial success `{ success: false, auth_restored: true, db_updated: false }`
- If `restoreCompleteAccess=true` AND `user_id` exists — calls `restore_team_lead_access` RPC
  - RPC fail → returns partial success `{ restoredCompleteAccess: false }`
- Returns `ParticipantUnbanResult` shape

#### Routes — `year_participants.routes.ts`

- `PATCH /:participantId/ban` — middleware: supabaseAuth, loadProfile, requireRole(Admin)
- `PATCH /:participantId/unban` — middleware: same, plus query param `restoreAuth` (stringbool optional)
- Unban route maps `restoreAuth` → `restoreCompleteAccess` when calling service
- Partial success returns 207, full success returns 200

#### Constants

- `PERMANENT_BAN_DURATION = '876000h'` in `src/constants/common.ts`

## 14. What's Next (in order)

1. Team memberships — assign participant to team (admin+ any team, team lead own team only)
2. Team memberships — move participant between teams (score transfer)
3. Team memberships — demote team lead to regular member within same team
4. Remove year access endpoint with cascade cleanup
5. Role promotion/demotion dashboard endpoints
6. Tasks and scoring (including `GET /years/:yearId/teams/:teamId/scores`)
7. Leaderboard
8. Testing suite
9. Team memberships — assign participant to team
10. Team memberships — move participant between teams (score transfer)
11. Team memberships — demote team lead to regular member within same team
12. Remove year access endpoint with cascade cleanup
13. Role promotion/demotion dashboard endpoints
14. Tasks and scoring (including `GET /years/:yearId/teams/:teamId/scores`)
15. Leaderboard
16. Testing suite
