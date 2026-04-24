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
   - Reads `yearId` from query param OR URL param: `c.req.query('yearId') ?? c.req.param('yearId') ?? null`

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
  - `getRequesterTeam({ userId, yearId, role, requestedTeamId })` — finds requester's team (`actualTeamId`) and restricts `canSeePII` only to their strictly requested team if provided
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
- Role enforcement for restricted params is done in the **service layer** — restricted params are silently ignored based on role, not rejected with 403
- The API enforces param restrictions independently of the frontend
- **Only one filter applies at a time (intentional)** — priority order: `email` → `mobile` → `name` for admin+; `name` only for viewer/user. If multiple params are sent, lower-priority ones are silently ignored. This is a deliberate product decision, not a bug.

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
   - If this fails — throw immediately, no DB changes made
3. Call Supabase RPC function atomically for all DB changes:
   - Set `banned = true` on `year_participants`
   - Set `profiles.global_role` to `viewer`
   - Delete `team_membership`
   - Delete current year `year_access` record only
4. If RPC fails — log error, return partial success

#### Unban Flow — All Participants

Two modes controlled by optional `restoreAccess` query param:

**Mode 1 — Basic Pardon:**
1. Fetch participant — verify exists, is actually banned
2. If `user_id` exists — re-enable Supabase account
3. Call `unban_participant` RPC — sets `banned = false`, restores `score_events`
4. Return updated participant — role stays as `viewer`, no year_access created

**Mode 2 — Full Reinstatement (`restoreAccess=true`):**
1. Same steps 1–4 as Mode 1
2. Additionally call `restore_team_lead_access` RPC:
   - Restores `profiles.global_role` from `previous_role`
   - Clears `previous_role` to null
   - Creates `year_access` for current year with `status: approved`

### Disqualification Logic

- Only applies to volunteers (`user_id = null`)
- Disqualify only allowed on unlocked years
- `disqualified = true` — participant stays in team, scores preserved but excluded from leaderboard
- Undisqualify: sets `disqualified = false` (admin+ only, unlocked year only)

### Scoring

- base: 0–N (max_base_score defined per task)
- gold: +5, silver: +3, bronze: +2, bonus: +1
- One base score per participant per task
- One medal per participant per task (participant cannot hold two medals on the same task)
- Medal uniqueness per task per team — only one gold, one silver, one bronze across all participants in a team for a given task
- Medal uniqueness is task-scoped, not global — same participant can hold gold on T1 and gold on T2
- Medal uniqueness is team-scoped — Team A's medals for T1 are fully independent of Team B's
- Bonus can stack (unlimited bonus rows)
- Admin can edit base score value only (PATCH)
- Team lead can award all score types for own team participants
- Bulk scoring fails entirely if any validation fails — no partial inserts
- Score events stored in `score_events` table — auditable, reversible
- Soft-deleted on participant ban (`is_deleted = true`), restored on unban

### Task Scoping & Ghost Points

- Tasks are either **Global** (`team_id: null`) or **Team-Specific** (`team_id: uuid`)
- When a participant is transferred between teams, `score_events` are NOT updated
- Points earned on Team A's specific tasks become **Ghost Points** when participant moves to Team B
- Leaderboard must filter score_events by task validity for current team

### Team Memberships

- Team lead can only assign unassigned participants to their own team
- Admin+ can assign any participant to any team
- Moving a participant between teams (admin+ only):
  - Regular participant → scores transfer to new team, old membership removed
  - Team lead → loses is_team_lead on old team, becomes regular participant on new team
- UI must show confirmation modal before moving any participant

### Year Access Flow

1. User requests access to a year → year_access record (status: pending)
2. Max 3 requests per user per year (rejected records count, stack in DB)
3. Admin approves → status: approved (viewer access)
4. Admin can promote viewer → user (team lead) via separate promotion dashboard

### Role Promotion & Demotion Rules

#### Viewer → Team Lead (user role) Promotion

- global_role updated to `user`
- If viewer has approved year_access for most recent year → create year_participant for that year only
- Team assignment is a separate explicit action by admin

#### Team Lead (user) → Admin Promotion

- global_role updated to `admin`
- Remove team_membership and year_participant for current year

#### Team Lead (user) → Viewer Demotion

- global_role updated to `viewer`
- Remove team_membership and year_participant for current year

#### Team Lead → Regular Participant (within same team)

- is_team_lead set to false on team_membership
- global_role stays as `user`

#### Moving a Team Lead to Another Team

- As regular member — old membership removed, new membership with is_team_lead = false
- As new team lead — old membership removed, new membership with is_team_lead = true
  - Blocked if target team already has a lead (409)
- global_role stays as `user` in all move scenarios

#### Removing Year Access

- Removes year_access record
- Also removes team_membership and year_participant for that year

---

## 6. Privacy Model

- email, mobile visible to: admin+, same team lead, self
  - "same team lead" means the requester is a team lead AND the specific team being queried identically matches their own team (`requestedTeamId === actualTeamId`)
- All others see masked/null values
- Enforced in backend service layer, not DB RLS

---

## 7. API Structure

### Routes (Built)

```
/profile
  POST /bootstrap         — create/update profile from JWT
  GET  /me                — get own profile

/years
  POST /                  — create year (superadmin)
  GET  /                  — get all years with access status
  POST /:yearId/lock      — lock year (admin+)
  POST /:yearId/participants               — add single participant (admin+)
  POST /:yearId/participants/bulk          — bulk CSV upload (admin+)
  GET  /:yearId/participants               — paginated volunteer list
  GET  /:yearId/teams/:teamId/participants — team volunteer list (limit 50)
  GET  /:yearId/team-leads                 — all team leads incl. banned (admin+)
  PATCH /:yearId/participants/:id
  PATCH /:yearId/participants/:id/ban
  PATCH /:yearId/participants/:id/unban
  PATCH /:yearId/participants/:id/disqualify
  PATCH /:yearId/participants/:id/undisqualify

/teams
  POST /create                    — create team (admin+)
  GET  /                          — get teams by yearId
  PATCH /:teamId                  — update team name (admin+)
  POST /year/:yearId/copy         — copy teams from previous year (admin+)

/team-memberships
  POST /?yearId=xxx                        — assign participant to team
  DELETE /:membershipId?yearId=xxx         — remove participant from team (admin+)
  PATCH /transfer?yearId=xxx               — transfer participant to another team (admin+)
  PATCH /:membershipId/promote?yearId=xxx  — promote to team lead (admin+)
  PATCH /:membershipId/demote?yearId=xxx   — demote to regular member (admin+)

/year-access
  POST /                          — request year access
  GET  /                          — get all requests grouped by status (admin+)
  GET  /users?yearId=xxx          — list approved users for year (admin+)
  PATCH /:id/approve              — approve request (admin+)
  PATCH /:id/reject               — reject request (admin+)
  DELETE /:userId/remove?yearId=xxx — remove year access + cascade cleanup (admin+)
```

### Planned Routes

```
/roles
  GET   /users            — list users with global_role (admin sees viewer/user, superadmin sees viewer/user/admin)
  PATCH /:userId/role     — promote or demote user, body: { currentRole, targetRole } (admin+)

/tasks
  POST  /                              — create task (admin+ or team lead for own team)
  GET   /?yearId=xxx&teamId=xxx        — fetch tasks + scores (viewer+)

/scores
  POST  /                              — award score to single participant (team lead+)
  POST  /bulk                          — award scores to multiple participants for a task (team lead+), all-or-nothing
  PATCH /:scoreEventId                 — edit base score value (admin only)
```

---

## 8. Validation Pattern

Custom `validate` middleware wraps `@hono/zod-validator`:

```ts
validate('json', schema);
validate('query', schema);
validate('param', schema);

const data = getValidated(c, 'json', schema);
```

### Schema Files

- `src/schemas/common.schema.ts` — `uuidSchema`, `nameSchema`
- `src/schemas/years.schema.ts` — `createYearSchema`, `lockYearSchema`
- `src/schemas/teams.schema.ts` — `createTeamSchema`, `getTeamsSchema`, `updateTeamNameSchema`, `updateTeamNameParamsSchema`, `teamIdsParamsSchema`
- `src/schemas/year_participants.schema.ts` — `yearParticipantsSchema`, `yearParticipantsParamsSchema`, `getYearParticipantsQuerySchema`, `getTeamParticipantsParamsSchema`, `getYearParticipantsBanParamsSchema`, `yearParticipantsUnbanParamsSchema`, `yearParticipantsUnbanQuerySchema`
- `src/schemas/year_access.schema.ts` — `requestYearAccessSchema`, `approveRejectYearAccessSchema`

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
  "data": {}
}
```

### Key Error Codes

- UNAUTHORIZED, FORBIDDEN
- PARTICIPANT_EMAIL_CONFLICT (409) — email already in use by another participant in the same year (returns conflicting participant name in data)
- VALIDATION_ERROR (422)
- YEAR_NOT_FOUND, YEAR_ALREADY_LOCKED
- TEAM_EXISTS, TEAM_NOT_FOUND
- PARTICIPANT_BANNED, YEAR_PARTICIPANT_ALREADY_EXISTS
- YEAR_ACCESS_FETCH_FAILED, YEAR_ACCESS_REQUEST_FAILED
- REQUEST_ATTEMPTS_EXCEEDED (429)
- TEAM_LEAD_ALREADY_EXISTS (409) — added for promotion flow
- USER_NOT_REGISTERED (400) — added for promotion flow
- YEAR_ACCESS_NOT_APPROVED (403) — added for promotion flow
- NOT_A_TEAM_LEAD (400) — added for demotion flow
- ROLE_OUT_OF_SYNC (409) — added for role change flow: body `currentRole` does not match DB `global_role`
- INVALID_ROLE_TRANSITION (400) — added for role change flow: same role or invalid transition pair
- ROLE_CHANGE_FAILED (500) — added for role change flow: DB update of `global_role` failed
- APP_USERS_FETCH_FAILED (500), APP_USERS_NOT_FOUND (404) — added for Auth API `listUsers` in `getAllAppUsers` util
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
  7. Return `{ succeeded, failed }` with status 207

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

- Rejected records stack in DB (unique index only blocks non-rejected duplicates)
- Grouped in memory — one DB call + one Auth API call
- Rejected entries aggregated — one per user with count

---

## 12. Constants

- `MAX_YEAR_REQUEST_ATTEMPTS = 3` — `src/constants/common.ts`
- `DEFAULT_PAGE`, `DEFAULT_PAGE_SIZE` — `src/constants/common.ts`
- `PERMANENT_BAN_DURATION = '876000h'` — `src/constants/common.ts`
- `Table` enum — all DB table names centralised in `src/constants/common.ts`
- `YearRoutes`, `TeamRoutes`, `TeamMembershipRoutes`, `YearAccessRoutes`, `ProfileRoutes`, `ParticipantRoutes` — `src/constants/routes.ts`

---

## 13. What's Done

- Auth middleware (supabaseAuth, loadProfile, requireRole, requireYearAccess)
- Profile bootstrap and fetch
- Years — create, lock, get all with access status
- Teams — create, get, update, copy to new year
- Year participants — single add, bulk CSV upload
- Year access — request, approve, reject, get all requests
- `validateYear({ yearId, yearLockedErrorMessage? })` shared utility in `src/utils/years.ts` — verifies year exists (404 `YEAR_NOT_FOUND`), verifies year is not locked (409 `YEAR_ALREADY_LOCKED`), returns year data. Used across all services that require year validation. `yearLockedErrorMessage` is optional — defaults to generic message if omitted.
- Shared utilities — `getRequesterTeam`, `applyPrivacyMask` in `src/utils/participants.ts`
- `getYearParticipants` service + `GET /years/:yearId/participants` route
- `getTeamYearParticipants` service + `GET /years/:yearId/teams/:teamId/participants` route
- Ban/Unban — complete with Pardon vs Reinstatement pattern, RPC functions, partial success
- Disqualify/Undisqualify
- `updateYearParticipant` service + `PATCH /:yearId/participants/:participantId` route --- admin+, partial update of name/email/mobile/regId, empty payload guard (400 `BAD_REQUEST`), email uniqueness check only when email present (409 `YEAR_PARTICIPANT_EMAIL_MISMATCH` with `conflictingParticipantName` in data), year lock enforced
- `getTeamLeadsForYear` service + `GET /years/:yearId/team-leads` route
- `addParticipantToTeam` service + `POST /team-memberships?yearId=xxx` route
- `validateTeamParticipants` shared utility in `src/utils/team_memberships.ts`
- `removeParticipantFromTeam` service + `DELETE /team-memberships/:membershipId?yearId=xxx` route
- `transferParticipant` service + `PATCH /team-memberships/transfer?yearId=xxx` route
- New error codes: `TEAM_LEAD_ALREADY_EXISTS`, `USER_NOT_REGISTERED`, `YEAR_ACCESS_NOT_APPROVED`, `NOT_A_TEAM_LEAD`, `TEAM_MEMBERSHIP_UPDATE_FAILED`
- `getPromotionContext` utility — 2 parallel queries + sequential profile fetch if user_id exists, returns `PromotionContext`
- `validateTeamParticipants` updated — now also returns `isTeamLead` field
- Pure validators — `validateParticipantForPromotion`, `validateYearAccess`, `validateTeamMembership`, `validateTeamLeadConstraint`
- `promoteToTeamLead` service — year lock check, getPromotionContext, sequential validators, sets `is_team_lead = true`
- `removeYearAccess` service — rejects year_access first, then if role=user: deletes team_membership + year_participant
  - Admin/superadmin cannot have their access removed via this endpoint (403)
  - Viewer: only year_access rejected
  - User (team lead): year_access rejected + team_membership deleted + year_participant deleted
  - Rejection counts toward MAX_YEAR_REQUEST_ATTEMPTS — intentional lockout mechanism
- `DELETE /year-access/:userId/remove?yearId=xxx` route built — admin+
- `getAllYearAccessProfiles` service built — 1 sequential call (year_access by yearId + approved status) then 2 parallel calls (profiles `.in(userIds)` + `listUsers`), merged in memory via Map, returns `{ id, role, email, name }` per user
- `GET /year-access/users?yearId=xxx` route built — admin+
- `demoteFromTeamLead` service — validateTeamParticipants, isTeamLead check, sets `is_team_lead = false`
- `PATCH /team-memberships/:membershipId/promote?yearId=xxx` route — admin+, body: `{ participantId, teamId }`
- `PATCH /team-memberships/:membershipId/demote?yearId=xxx` route — admin+, body: `{ teamId }`
- `getAllAppUsers` utility in `src/utils/users.ts` — wraps Auth Admin API `listUsers`, accepts `allowNoUsers` flag
- `getAppUsers` service — parallel: Auth API + profiles `.in(global_role, [viewer, user, admin])`, merged via Map, filtered by actor role
- `updateUserRole` service — fetches target profile, verifies `currentRole` matches DB (409 `ROLE_OUT_OF_SYNC`), validates transition, applies side effects, updates `global_role`
- `getActiveYear` util — queries `years` where `is_locked IS NULL OR false`, order `created_at DESC`, limit 1
- `validateRoleTransition` util — checks same-role (400), valid transition set (400), admin vs superadmin-only transitions (403)
- `applyRoleSideEffects` util — switch on `RoleTransition`, applies DB changes per transition matrix
  - `viewer->user`: checks approved `year_access`, creates `year_participant` (`mobile: null`, ignores 23505)
  - `user->viewer` / `user->admin`: deletes `team_membership` if exists, deletes `year_participant`
  - `viewer->admin`: deletes `year_access` for active year
  - `admin->viewer`: creates approved `year_access` if not already approved
  - `admin->user`: creates approved `year_access` if not exists, then creates `year_participant` (`mobile: null`); if participant insert fails after `year_access` created, throws 500 with `data: { yearAccessCreation: true, yearParticipantCreation: false }` to surface partial state
- `GET /roles/users` route — admin+, returns merged user list filtered by actor role
- `PATCH /roles/:userId/role` route — admin+, `userId` from param (not body), body: `{ currentRole, targetRole }`

### Supabase RPC Functions

- `ban_volunteer(p_participant_id)` — sets `banned = true` on `year_participants`, deletes `team_memberships`, soft-deletes `score_events` (`is_deleted = true`)
- `ban_team_lead(p_participant_id, p_user_id, p_year_id)` — sets `banned = true` on `year_participants`, saves `global_role` to `previous_role` and demotes to `viewer` on `profiles`, deletes `team_memberships`, deletes `year_access` for that year only
- `unban_participant(p_participant_id)` — sets `banned = false` on `year_participants`, restores `score_events` (`is_deleted = false`)
- `restore_team_lead_access(p_user_id, p_year_id)` — restores `global_role` from `previous_role` (throws if null), clears `previous_role`, inserts approved `year_access` for the given year

---

## 14. Role Promotion/Demotion Dashboard — Built ✅

### Endpoints

```
GET  /roles/users              — list users with global_role (admin+)
PATCH /roles/:userId/role      — promote or demote a user (admin+)
```

### GET /roles/users

- Parallel: Auth Admin API `listUsers` (perPage: 1000, via `getAllAppUsers`) + `profiles` `.in("global_role", [viewer, user, admin])`
- Merged in memory via Map on `user.id`
- **Admin** sees: viewer, user roles only
- **Superadmin** sees: viewer, user, admin roles (superadmin excluded from management)

### PATCH /roles/:userId/role — Body: `{ currentRole, targetRole }`

- `userId` comes from URL param — NOT from body
- Fetches target user's actual `global_role` from `profiles` first
- If `currentRole` in body does not match DB → 409 `ROLE_OUT_OF_SYNC`

#### Role Change Permission Matrix

| Actor       | Allowed Transitions                                          |
| ----------- | ------------------------------------------------------------ |
| admin       | viewer ↔ user only                                           |
| superadmin  | viewer ↔ user, viewer ↔ admin, user ↔ admin                  |

- Same role → 400 `INVALID_ROLE_TRANSITION`
- Invalid transition pair → 400 `INVALID_ROLE_TRANSITION`
- Admin attempting admin-scoped transition → 403 `FORBIDDEN`
- `currentRole` body mismatch with DB → 409 `ROLE_OUT_OF_SYNC`

#### Side Effects Per Transition

| Transition     | Side Effects                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| viewer → user  | Create `year_participant` (`mobile: null`, ignores 23505) — only if active year exists AND viewer has approved `year_access` |
| user → viewer  | Delete `team_membership` (if exists) + delete `year_participant` for active year                              |
| viewer → admin | Delete `year_access` for active year (if exists)                                                              |
| admin → viewer | Create approved `year_access` for active year (if exists and not already approved)                            |
| user → admin   | Delete `team_membership` (if exists) + delete `year_participant` for active year                              |
| admin → user   | Create approved `year_access` (if not exists) + create `year_participant` (`mobile: null`, ignores 23505); partial failure surfaced via `data: { yearAccessCreation: true, yearParticipantCreation: false }` |

#### Active Year Determination

- Query `years` where `is_locked IS NULL OR is_locked = false`, order by `created_at DESC`, limit 1
- If no active year — skip side effects that depend on it, proceed with role change only

### Files

- `src/utils/users.ts` — `getAllAppUsers(allowNoUsers?)` — shared Auth API wrapper
- `src/utils/roles.ts` — `getActiveYear`, `validateRoleTransition`, `applyRoleSideEffects`
- `src/services/roles.ts` — `getAppUsers`, `updateUserRole`
- `src/routes/roles.routes.ts` — `GET /users`, `PATCH /:userId/role`
- `src/schemas/roles.schema.ts` — `usersRoleChangeParamsSchema` (userId), `usersRoleChangeBodySchema` (currentRole, targetRole)

---

## 15. What's Next (in order)

1. Tasks and scoring
2. Leaderboard
3. Testing suite