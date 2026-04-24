# BCC Team Manager — Product & Implementation Plan

## 1. What Is This App?

BCC Team Manager is a backend system built for **Bengaluru Comic Con** to coordinate
volunteers across yearly events. Each year BCC runs an event with 10–20 volunteer
teams. The system manages who participates, which team they belong to, how they
are scored, and who can see what data.

The system is API-first. A React frontend consumes it. All infrastructure runs
on free-tier services.

---

## 2. Core Concepts

| Concept         | Description                                                |
| --------------- | ---------------------------------------------------------- |
| **Year**        | One BCC event. All data is scoped to a year.               |
| **Team**        | A volunteer squad within a year. 10–20 teams per year.     |
| **Participant** | A volunteer registered for a year. Most don't use the app. |
| **Team Lead**   | A participant who manages a team. Has app access.          |
| **Year Access** | Controls which users can see which year's data.            |
| **Scoring**     | Points awarded per task. Drives leaderboard.               |
| **Leaderboard** | Ranks volunteers per team and across the year.             |

---

## 3. User Roles

| Role           | Description                                               |
| -------------- | --------------------------------------------------------- |
| **viewer**     | Authenticated user, approved for a year, sees masked data |
| **user**       | Team lead. Manages own team. Scores participants.         |
| **admin**      | Full control within a year. Approves access requests.     |
| **superadmin** | Full system-wide control. Creates years.                  |

### Role Hierarchy

```
viewer < user < admin < superadmin
```

---

## 4. Full Feature List

### 4.1 Authentication & Profiles

- [x] Google OAuth login
- [x] Email/password login (for testing)
- [x] JWT verification via JWKS (ES256)
- [x] Profile auto-creation on first login (bootstrap)
- [x] Profile stores name, email, global_role
- [ ] Profile update endpoint (PATCH /profile)

### 4.2 Year Management

- [x] Create year (superadmin only)
- [x] Lock year — makes it immutable (admin+)
- [x] Get all years with per-user access status
- [x] Year creation guard — block if any existing year is unlocked (409, returns unlocked_years list, checks is_locked = false OR null)
- [ ] Get single year details

### 4.3 Year Access Control

- [x] User requests access to a year
- [x] Admin views all requests (grouped: pending, approved, rejected)
- [x] Admin approves request (grants viewer access)
- [x] Admin rejects request
- [x] Max 3 requests per user per year
- [x] Remove year access (admin+) — `DELETE /year-access/:userId/remove?yearId=xxx`, rejects year_access + cascade cleanup for team leads
- [x] List all approved year access users — `GET /year-access/users?yearId=xxx` (admin+, excludes banned, merges Auth API + profiles)
- [ ] Notify user via email on approve/reject (Brevo)

### 4.3a Role Promotion & Demotion (`/roles` dashboard) ✅ DONE

- [x] `GET /roles/users` — list users with global_role (admin+)
  - Parallel: Auth Admin API `listUsers` (via `getAllAppUsers`) + `profiles` `.in("global_role", [viewer, user, admin])`
  - Merged in memory via Map; filtered by actor role
  - Admin sees: viewer, user only
  - Superadmin sees: viewer, user, admin (superadmin excluded from management)
- [x] `PATCH /roles/:userId/role` — single endpoint, `userId` from URL param, body: `{ currentRole, targetRole }` (admin+)
  - Fetches target user's actual `global_role` from `profiles` — verifies it matches `currentRole` from body
  - If mismatch → 409 `ROLE_OUT_OF_SYNC` (frontend state is stale)
  - Admin: viewer ↔ user only. Attempt to go beyond → 403
  - Superadmin: viewer ↔ user, viewer ↔ admin, user ↔ admin
  - Same role → 400 `INVALID_ROLE_TRANSITION`. Invalid pair → 400 `INVALID_ROLE_TRANSITION`

#### Side Effects Per Transition (implemented)

| Transition     | Side Effects |
| -------------- | ------------ |
| viewer → user  | Create `year_participant` (`mobile: null`, ignores 23505) — only if active year exists AND viewer has approved `year_access` |
| user → viewer  | Delete `team_membership` (if exists) + delete `year_participant` for active year |
| viewer → admin | Delete `year_access` for active year (if exists) |
| admin → viewer | Create approved `year_access` for active year (if exists and not already approved) |
| user → admin   | Delete `team_membership` (if exists) + delete `year_participant` for active year |
| admin → user   | Create approved `year_access` (if not exists) + create `year_participant` (`mobile: null`); partial failure surfaced via `data: { yearAccessCreation: true, yearParticipantCreation: false }` |

**Active year:** `years` where `is_locked IS NULL OR is_locked = false`, order `created_at DESC`, limit 1.
If no active year → skip dependent side effects, proceed with role change only.

### 4.4 Team Management

- [x] Create team for a year (admin+)
- [x] Get all teams for a year (any authenticated user)
- [x] Update team name (admin+)
- [x] Copy teams from previous year to new year — `POST /teams/year/:yearId/copy`, body: `{ teamIds }`, skips duplicates by name, returns `{ created, skipped }`
- [ ] Get single team details
- [ ] Delete team (superadmin only — soft delete)

### 4.5 Participant Management

- [x] Add single participant to a year (admin+)
- [x] Bulk add participants via CSV (admin+)
- [x] Get all volunteers for a year — paginated, 50/page, default sort name asc, with filtering and sorting (any with year access)
- [x] Get all volunteers for a specific team — limit 50, sorted by name, privacy masked (any with year access)
  - Scores excluded — served via separate endpoint when scoring is built (Option B decision)
- [x] Privacy masking — email/mobile redacted based on role and team assignment
- [x] Shared utility functions — `getRequesterTeam`, `applyPrivacyMask`
- [ ] Get single participant details
- [x] Ban participant (admin+) — excluded from all volunteer listings
  - Regular volunteer: `banned=true`, delete team_membership, soft delete score_events (`is_deleted=true`)
  - Team lead: disable Supabase account first (`ban_duration: '876000h'`), then RPC: `banned=true`, save `previous_role`, demote to viewer, delete team_membership, delete current year year_access only
  - Historical year_access records for other years preserved
  - Admin/superadmin not bannable — throws 403
- [x] Unban participant (admin+) — two modes via `restoreAuth` query param
  - Basic pardon — lifts ban, restores scores, re-enables Supabase account. No role/access restoration.
  - Full reinstatement (`restoreAuth=true`) — additionally restores `global_role` from `previous_role`, creates year_access
  - Partial success (207) when auth restored but DB fails
  - `restore_team_lead_access` RPC handles reinstatement atomically
- [x] Disqualify participant (admin+) — visible in listings, excluded from leaderboard, team lead guard, unlocked year only
- [x] Undisqualify participant (admin+) — sets disqualified=false, unlocked year only
- [x] Update participant details (admin+) — `PATCH /:yearId/participants/:id`, partial update of name/email/mobile, email uniqueness enforced (409 `PARTICIPANT_EMAIL_CONFLICT` with conflicting name), year lock check, unlocked years only
- [x] `GET /years/:yearId/team-leads` — staff dashboard (admin+)
  - Shows year_participants where user_id IS NOT NULL (includes banned)
  - Left join team_memberships — unassigned team leads show with null team
  - Full PII visible, no pagination (max 25–30 team leads per year)

#### Participant Listing — Filtering and Sorting Design (Locked)

**Year view** — DB-level filtering and sorting required (pagination makes client-side incorrect)

| Param  | Allowed For                   | Default | Behaviour                                        |
| ------ | ----------------------------- | ------- | ------------------------------------------------ |
| page   | All                           | 1       | 50 per page                                      |
| sort   | `name`: All / `email`: admin+ | `name`  | `email` sort silently ignored for viewer/user    |
| order  | All                           | `asc`   | asc or desc                                      |
| name   | All                           | —       | ilike contains (`%value%`), case-insensitive     |
| email  | Admin+ only                   | —       | ilike contains, silently ignored for viewer/user |
| mobile | Admin+ only                   | —       | ilike contains, silently ignored for viewer/user |

- Filter method: `.ilike('field', '%value%')` — contains, case-insensitive — for all filter fields
- Restricted params silently ignored for viewer/user — not rejected with 403
- Banned participants excluded from results in both views
- Disqualified participants included in results in both views

**Team view** — no pagination, sorting and filtering handled client-side by TanStack Table.

### 4.6 Team Memberships

- [x] Assign participant to team — admin+ (any team) or team lead (own team only, unassigned participants only)
  - `POST /team-memberships?yearId=xxx`, body: `{ teamId, participantId }`, handles 23505 with 409
- [x] Remove participant from team (admin+) — `DELETE /team-memberships/:membershipId?yearId=xxx`
- [x] Move regular participant to another team (admin+ only) — `PATCH /team-memberships/transfer?yearId=xxx`
  - Ghost Points: score_events NOT updated on transfer, team-specific task points don't count for new team
- [x] Promote participant to team lead — `PATCH /team-memberships/:membershipId/promote?yearId=xxx`
  - 7 preconditions via `getPromotionContext` + pure validators, frontend-orchestrated swap
- [x] Demote team lead to regular member — `PATCH /team-memberships/:membershipId/demote?yearId=xxx`
  - Sets `is_team_lead = false`, stays in same team, role unchanged

#### Team Lead Demotion Rules

- **Within same team** — is_team_lead set to false, stays in same team as regular member. Separate action required to remove from team entirely.
- **When moved to another team as regular member** — old team_membership removed, new team_membership with is_team_lead = false
- **When moved to another team as new team lead** — old team_membership removed, new team_membership with is_team_lead = true. Blocked if target team already has a lead.
- **Full demotion (global role → viewer)** — team_membership and year_participant removed for current year
- In all move scenarios, global_role stays as `user`. Admin manually awards one-time bonus for prior contribution.

### 4.7 Team Lead Promotion (Global Role — via /roles dashboard)

- [ ] Handled via /roles promotion dashboard — global role change only
- [ ] year_participant created for most recent year if approved year_access exists at promotion time
- [ ] Team assignment is a separate explicit step — creates team_membership with is_team_lead = true

### 4.8 Tasks & Scoring

- [ ] Create global task — admin+ (`team_id: null`)
- [ ] Create team-scoped task — admin+ or team lead for own team
- [ ] Get tasks + scores for a year/team — returns `{ tasks, scores }`, participant data served separately from `getTeamYearParticipants`
- [ ] Award score to single participant — team lead for own team (all event types)
- [ ] Award scores to multiple participants for a task (bulk) — team lead for own team, all-or-nothing (no partial inserts)
- [ ] Edit base score value — admin only (PATCH)

#### Scoring Rules (Locked)

- One base score per participant per task
- One medal per participant per task
- Medal uniqueness per task per team — only one gold, one silver, one bronze across all team participants for a given task
- Medal uniqueness is task-scoped — same participant can hold gold on T1 and gold on T2
- Medal uniqueness is team-scoped — Team A's medals for T1 independent of Team B's
- Bonus rows are unlimited
- Score event types: `base | gold | silver | bronze | bonus`
- Score values: gold +5, silver +3, bronze +2, bonus +1, base 0–N

#### GET /tasks Response Shape

Frontend already holds participant data from `getTeamYearParticipants`. Tasks endpoint returns:

```ts
{
  tasks: [{ id, title, max_base_score, team_id }],
  scores: {
    [taskId]: {
      [yearParticipantId]: {
        base: number | null,
        medal: "gold" | "silver" | "bronze" | null,
        bonus_count: number
      }
    }
  }
}
```

#### Data Fetching Strategy

Two queries — participants and tasks are independent, N+1 not viable:
- Q1: participant IDs (internal only) via `team_memberships → year_participants`, `user_id IS NULL`
- Q2: `tasks` LEFT JOIN `score_events`, filtered by `year_id`, `team_id OR null`, `year_participant_id IN [Q1 ids]`
- Service layer aggregates flat rows into nested score map, merged into response

### 4.9 Leaderboard

- [ ] Per-team leaderboard — ranked volunteers within a team
- [ ] Year leaderboard — compares top 2 per team across all teams
- [ ] Excludes disqualified participants
- [ ] Excludes team leads, admins, superadmins

### 4.10 Privacy

- [x] email and mobile masked for non-admin, non-self, non-team-lead
- [x] Applied in service layer before response is sent
- [x] Team lead can see own team's full contact info only (strictly enforced via `requestedTeamId` validation in `getRequesterTeam`)

### 4.11 Audit Logging

- [ ] Log all admin actions (create, update, ban, score changes)
- [ ] Stored in audit_logs table
- [ ] Viewable by superadmin

### 4.12 Email Notifications (Brevo)

- [ ] Year access approved email
- [ ] Year access rejected email
- [ ] Magic link email (if re-enabled)

### 4.13 Testing

- [ ] Unit tests for service layer
- [ ] Integration tests for all endpoints
- [ ] Bruno collection for manual API testing

---

## 5. Implementation Plan

### Phase 1 — Core Infrastructure ✅ DONE

- Biome linting/formatting configured
- Git pre-commit hooks set up
- Table enum and route constants centralised
- Auth middleware (supabaseAuth, loadProfile, requireRole)
- Error handling (AppError, global handler, error codes)
- Zod validation pattern (validate middleware, getValidated helper)
- Profile bootstrap
- Year CRUD
- Team CRUD
- Year access request flow

### Phase 2 — Participant Management ✅ DONE

- [x] Single participant add
- [x] Bulk CSV upload
- [x] Participant listing design — filtering, sorting, role enforcement, filter method decisions
- [x] Zod schemas — `getYearParticipantsQuerySchema`, `getTeamParticipantsParamsSchema`
- [x] Shared utilities — `getRequesterTeam`, `applyPrivacyMask` in `src/utils/participants.ts`
- [x] Get year volunteers — paginated, DB-level filtering/sorting, privacy masked
- [x] Get team volunteers — non-paginated, privacy masked, inner join on team_memberships, limit 50
- [x] Ban/Unban — complete with Pardon vs Reinstatement pattern, RPC functions, partial success handling
- [x] Disqualify/Undisqualify

### Phase 3 — Team Memberships & Promotion ✅ DONE

- [x] Assign participant to team (admin+ any team, team lead own team only)
- [x] Remove participant from team (admin+)
- [x] Move participant between teams (admin+ only, ghost points decision locked)
- [x] New error codes — `TEAM_LEAD_ALREADY_EXISTS`, `USER_NOT_REGISTERED`, `YEAR_ACCESS_NOT_APPROVED`, `NOT_A_TEAM_LEAD`
- [x] `getPromotionContext` utility in `src/utils/team_memberships.ts`
- [x] Pure validator functions in `src/utils/team_memberships.ts`
- [x] `promoteToTeamLead` service + `PATCH /team-memberships/:membershipId/promote?yearId=xxx`
- [x] `demoteFromTeamLead` service + `PATCH /team-memberships/:membershipId/demote?yearId=xxx`

### Phase 4 — Role Promotion/Demotion Dashboard ✅ DONE

- [x] `src/utils/users.ts` — `getAllAppUsers(allowNoUsers?)` shared Auth API wrapper
- [x] `src/utils/roles.ts` — `getActiveYear`, `validateRoleTransition`, `applyRoleSideEffects`
- [x] `getAppUsers` service + `GET /roles/users` route
- [x] `updateUserRole` service + `PATCH /roles/:userId/role` route

### Phase 5 — Tasks & Scoring

- Task creation (team-level and year-level)
- Score event recording
- Score editing rules (admin base only)
- Medal and bonus logic

### Phase 6 — Leaderboard

- Per-team leaderboard query
- Year leaderboard (top 2 per team)
- Exclusion logic (disqualified, staff roles)

### Phase 7 — Notifications

- Brevo email integration
- Access approval/rejection emails

### Phase 8 — Audit Logging

- Log admin actions
- Audit log viewer endpoint

### Phase 9 — Testing Suite

- Bruno collection (manual)
- Unit tests (service layer)
- Integration tests (endpoints)

---

## 6. Key Technical Decisions

| Decision                               | Choice                                                                    | Reason                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Validation                             | Zod v4 via custom `validate` middleware                                   | Type-safe, consistent across routes                                                                                             |
| Auth                                   | Supabase JWT via JWKS                                                     | Secure, no custom auth needed                                                                                                   |
| Privacy                                | Backend masking, not DB RLS                                               | More flexible, easier to maintain                                                                                               |
| Bulk upload                            | CSV only, partial success (207)                                           | Simple, Google Sheets compatible                                                                                                |
| Ban check                              | Most recent record per email                                              | System enforces ban at registration                                                                                             |
| Year access cache                      | No cache, fresh DB per request                                            | Serverless constraint (Deno Deploy)                                                                                             |
| Error response                         | `{ error, error_code, data? }`                                            | Machine readable for frontend                                                                                                   |
| Scoring                                | event-based (score_events table)                                          | Auditable, reversible                                                                                                           |
| Leaderboard                            | Derived view from score_events                                            | Always accurate, no denormalization                                                                                             |
| Participant filter method              | `ilike '%value%'` (contains)                                              | Better UX at BCC's scale; sequential scan cost negligible at 100–500 rows/year                                                  |
| Restricted param enforcement           | Silent ignore based on role                                               | Endpoint is accessible to all; only specific params are restricted; 403 would misrepresent access                               |
| Team view sort/filter                  | Client-side via TanStack Table                                            | No pagination; full dataset in memory; no API changes needed                                                                    |
| Banned participants in listing         | Excluded entirely                                                         | Separate admin-only page for ban management within year                                                                         |
| Disqualified in listing                | Included                                                                  | Separate admin-only page for disqualify management; admin can undisqualify                                                      |
| Role promotion/demotion                | Global role change only via separate dashboard                            | Role is system-wide, not year-scoped; team assignment is a separate step                                                        |
| Year creation guard                    | Block if any unlocked year exists                                         | One active year at a time — BCC runs one event at a time                                                                        |
| Team lead demotion within team         | is_team_lead = false, stays in team                                       | Avoids extra admin friction; removal is a separate explicit action                                                              |
| Remove year access                     | Cascade delete year_access + team_membership + year_participant           | Keeps data consistent; team leads have no scores, safe to delete                                                                |
| year_participant creation on promotion | Created for most recent year if approved year_access exists               | Avoids creating orphaned records across all years; most recent year is the active one                                           |
| Ban atomicity                          | Best effort: Auth API disable first, then Supabase RPC for all DB changes | Auth API is outside DB transaction boundary; RPC handles DB atomicity; partial success surfaced if RPC fails after auth disable |
| score_events on ban                    | Soft delete (`is_deleted = true`)                                         | Preserves audit trail; reversible on unban                                                                                      |
| Ban scope                              | Single year_participant record only                                       | Registration check against most recent record enforces permanent ban system-wide                                                |
| Team lead ban — year_access cleanup    | Delete current year only                                                  | Historical year_access records preserved; only active year access removed                                                       |
| Roles endpoint structure               | Single `PATCH /roles/:userId/role` with `{ currentRole, targetRole }` body | Avoids two endpoints with identical auth/side-effect logic; direction inferred from payload |
| Roles — admin visibility scope         | Admin sees viewer/user only; superadmin sees viewer/user/admin            | Superadmin management out of scope for admin; superadmin role itself never manageable       |
| Roles — invalid transition handling    | 400 BAD_REQUEST; same-role also 400                                       | Frontend prevents this; API enforces it independently                                       |
| Roles — active year for side effects   | `is_locked IS NULL OR false`, order by `created_at DESC`, take first      | Business rule already guarantees at most one unlocked year                                  |
| Roles — currentRole verification        | Fetch actual `global_role` from DB, compare to `currentRole` in body; 409 `ROLE_OUT_OF_SYNC` on mismatch | Frontend state may be stale; side effects must execute against verified state, not caller assumptions |
| Roles — no active year                 | Skip dependent side effects, proceed with role change only                | Role is global; active year is contextual — missing year should not block role change       |
| Team lead promotion error code         | `TEAM_LEAD_ALREADY_EXISTS` (chosen over `TEAM_LEAD_EXISTS`)               | More descriptive; frontend not yet built so no contract to break                                                                |

---

## 7. API Route Summary

```
/profile
  POST  /bootstrap                          — auto-create profile on login
  GET   /me                                 — get own profile

/years
  POST  /                                   — create year (superadmin)
  GET   /                                   — list years with access status
  POST  /:yearId/lock                       — lock year (admin+)
  POST  /:yearId/participants               — add participant (admin+)
  POST  /:yearId/participants/bulk          — bulk CSV upload (admin+)
  GET   /:yearId/participants               — paginated volunteer list (any with year access)
  GET   /:yearId/teams/:teamId/participants — team volunteer list (any with year access)
  GET   /:yearId/team-leads                 — all team leads incl. banned (admin+)
  PATCH /:yearId/participants/:id               — update participant details (admin+)
  PATCH /:yearId/participants/:id/ban
  PATCH /:yearId/participants/:id/unban
  PATCH /:yearId/participants/:id/disqualify
  PATCH /:yearId/participants/:id/undisqualify

/teams
  POST  /create                             — create team (admin+)
  GET   /                                   — list teams for year
  PATCH /:teamId                            — update team name (admin+)
  POST  /year/:yearId/copy                  — copy teams from previous year (admin+)

/team-memberships
  POST  /?yearId=xxx                        — assign participant to team (user+)
  DELETE /:membershipId?yearId=xxx          — remove from team (admin+)
  PATCH /transfer?yearId=xxx                — move participant to another team (admin+)
  PATCH /:membershipId/promote?yearId=xxx   — promote to team lead (admin+)
  PATCH /:membershipId/demote?yearId=xxx    — demote to regular member (admin+)

/year-access
  POST  /                                   — request year access
  GET   /                                   — view all requests grouped (admin+)
  GET   /users?yearId=xxx                   — list approved users for year (admin+)
  PATCH /:id/approve                        — approve request (admin+)
  PATCH /:id/reject                         — reject request (admin+)
  DELETE /:userId/remove?yearId=xxx             — remove year access + cascade cleanup (admin+)

/roles
  GET   /users                              — list users with global_role, filtered by actor role (admin+)
  PATCH /:userId/role                       — promote or demote, body: { currentRole, targetRole } (admin+)

/tasks                                      — PLANNED
  POST  /                                   — create task (admin+ or team lead for own team)
  GET   /?yearId=xxx&teamId=xxx             — fetch tasks + scores (viewer+)

/scores                                     — PLANNED
  POST  /                                   — award score to single participant (team lead+)
  POST  /bulk                               — award scores to multiple participants for a task (team lead+), all-or-nothing
  PATCH /:scoreEventId                      — edit base score value (admin only)
/leaderboard                                — PLANNED
/audit-logs                                 — PLANNED
```

---

## 8. Infrastructure

| Service     | Usage             | Tier |
| ----------- | ----------------- | ---- |
| Deno Deploy | Backend hosting   | Free |
| Supabase    | PostgreSQL + Auth | Free |
| Brevo       | Email sending     | Free |
| GitHub      | Source control    | Free |

---

## 9. What's Next (Immediate)

1. Tasks and scoring
2. Leaderboard
3. Testing suite