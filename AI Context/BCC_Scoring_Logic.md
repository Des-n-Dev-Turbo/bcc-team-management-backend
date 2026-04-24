# BCC Team Manager — Tasks & Scoring Design

## 1. Feature Scope

- Create global tasks (admin+) and team-scoped tasks (team lead for own team)
- Award scores per participant per task
- Score types: base (0–N), medal (gold/silver/bronze), bonus (stackable)
- One base score per participant per task
- One medal per participant per task
- Unlimited bonus rows per participant per task
- Team lead: award all score types for own team participants
- Admin: edit base score only (PATCH)

---

## 2. Data Model

### `tasks`
| Column | Type | Notes |
|---|---|---|
| id | uuid, pk | |
| title | text | |
| year_id | uuid, fk → years.id | |
| team_id | uuid, nullable, fk → teams.id | null = global task |
| max_base_score | int | |
| created_at | timestamptz | |

### `score_events`
| Column | Type | Notes |
|---|---|---|
| id | uuid, pk | |
| task_id | uuid, fk → tasks.id | |
| year_participant_id | uuid, fk → year_participants.id | |
| event_type | enum: base \| gold \| silver \| bronze \| bonus | |
| value | int | |
| created_by | uuid, fk → auth.users.id | |
| is_deleted | boolean, default false | soft-deleted on participant ban |
| created_at | timestamptz | |

---

## 3. Routes

```
POST   /tasks                        — create task (admin+ or team lead for own team)
GET    /tasks?yearId=xxx&teamId=xxx  — fetch tasks + scores (viewer+)
POST   /scores                       — award score to single participant (team lead+)
POST   /scores/bulk                  — award scores to multiple participants for a task (team lead+)
PATCH  /scores/:scoreEventId         — edit base score value (admin only)
```

---

## 4. GET /tasks Response Shape

Frontend already holds participant details from `getTeamYearParticipants`. This endpoint returns tasks and scores only — no participant data duplicated.

```ts
{
  tasks: [
    { id, title, max_base_score, team_id }
  ],
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

Frontend merges `participantId → scores[taskId][participantId]` to render the table.

---

## 5. Scorable Participants

- `year_participants` where `user_id IS NULL` (volunteers only)
- Team leads are year_participants but excluded — `getTeamYearParticipants` already handles this filter correctly

---

## 6. Data Fetching Strategy

Two independent queries. N+1 not viable. Single query from either side loses rows where scores are absent.

### Query 1 — Participant IDs (internal only, not returned)

```ts
supabase
  .from('team_memberships')
  .select(`
    id,
    year_participant_id,
    year_participants!inner(id)
  `)
  .eq('team_id', teamId)
  .eq('year_participants.year_id', yearId)
  .is('year_participants.user_id', null)
  .eq('is_deleted', false)
```

Extract `year_participant_id` list for use in Query 2.

### Query 2 — Tasks + Score Events

```ts
supabase
  .from('tasks')
  .select(`
    id,
    title,
    max_base_score,
    team_id,
    score_events(
      id,
      year_participant_id,
      event_type,
      value,
      is_deleted
    )
  `)
  .eq('year_id', yearId)
  .or(`team_id.eq.${teamId},team_id.is.null`)
  .in('score_events.year_participant_id', participantIds)
  .eq('score_events.is_deleted', false)
```

**Note:** No `!inner` on `score_events` — tasks with zero matching score events must still appear with empty score_events array. Verify this behaviour in Supabase before finalising.

---

## 7. Service Layer Aggregation

From flat `score_events` rows per task, build nested map:

```ts
{ [taskId]: { [yearParticipantId]: { base, medal, bonus_count } } }
```

Iteration logic:
- Loop over each task row
- Loop over each `score_event` on that task
- Group by `year_participant_id`
- Per event_type:
  - `base` → set `base = value`
  - `gold | silver | bronze` → set `medal = event_type`
  - `bonus` → increment `bonus_count`

Result merged into response shape.

---

## 8. Authorization Rules

| Action | Who |
|---|---|
| Create global task | admin+ |
| Create team task | team lead (own team only) or admin+ |
| Award any score type | team lead (own team only) |
| Edit base score value | admin only |
| View tasks + scores | viewer+ (with year access) |

---

## 9. Business Rules

- One base score per participant per task (enforce at POST /scores and /scores/bulk)
- One medal per participant per task — a participant cannot hold two medals on the same task
- Medal uniqueness per task per team — only one gold, one silver, one bronze allowed across all participants in a team for a given task
- Medal uniqueness is task-scoped, not global — same participant can hold gold on T1 and gold on T2
- Medal uniqueness is team-scoped — Team A's medals for T1 are independent of Team B's medals for T1
- Bonus rows are unlimited
- Bulk scoring (`POST /scores/bulk`) — all or nothing, no partial inserts. Validate all rows upfront before any insert.
- Banned participant score_events are soft-deleted (`is_deleted = true`) — already handled by RPC
- `is_deleted = false` filter applied in Query 2 — soft-deleted scores excluded from response

---

## 10. Files to Create

```
src/schemas/tasks.schema.ts
src/schemas/scores.schema.ts
src/services/tasks.service.ts
src/routes/tasks.routes.ts
src/routes/scores.routes.ts
src/constants/routes.ts         — add TaskRoutes, ScoreRoutes
src/constants/common.ts         — add Table.tasks, Table.score_events if not present
```