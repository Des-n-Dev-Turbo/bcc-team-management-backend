# Phase 4 — Role Promotion/Demotion Dashboard

Implement the Role Promotion & Demotion Dashboard (`/roles`) according to Phase 4 of the Product Plan. This includes endpoints for Admins and Superadmins to fetch users by role and execute complex role transitions.

## Proposed Changes

### Configuration
---

#### [MODIFY] [src/constants/routes.ts](file:///Users/mpaishridhar/Documents/VS%20Code%20Projects/bcc-team-management-backend/src/constants/routes.ts)
Add `RolesRoutes` mapping:
- `Base: "/roles"`
- `GetUsers: "/users"`
- `ChangeRole: "/:userId/role"`

#### [MODIFY] [src/main.ts](file:///Users/mpaishridhar/Documents/VS%20Code%20Projects/bcc-team-management-backend/src/main.ts)
Import and attach `rolesRoutes` to `app.route(ROUTES.RolesRoutes.Base, ...)`

### Schemas
---

#### [NEW] [src/schemas/roles.schema.ts](file:///Users/mpaishridhar/Documents/VS%20Code%20Projects/bcc-team-management-backend/src/schemas/roles.schema.ts)
Create `changeRoleSchema` containing:
- `currentRole`: strict string enum mapping to `Role` values.
- `targetRole`: strict string enum mapping to `Role` values.

### Utilities
---

#### [NEW] [src/utils/roles.ts](file:///Users/mpaishridhar/Documents/VS%20Code%20Projects/bcc-team-management-backend/src/utils/roles.ts)
House pure utility and side-effect flow functions:
- `getActiveYear(db)`: Fetches the most recent unlocked year.
- `validateRoleTransition(actorRole, currentRole, targetRole)`: Verifies permissions (Admin handles User/Viewer, Superadmin handles User/Viewer/Admin) and ensures transition logic is valid.
- `applyRoleSideEffects(db, userId, transition, activeYearId)`: Resolves the exact modifications to `year_participants`, `team_memberships`, and `year_access` tables according to the transition matrix defined in Section 4.3a.

### Services
---

#### [NEW] [src/services/roles.ts](file:///Users/mpaishridhar/Documents/VS%20Code%20Projects/bcc-team-management-backend/src/services/roles.ts)
- `getRolesDashboardUsers(actorRole)`: 
  - Iterates Auth API `listUsers` and cross-references `Profiles`. 
  - Filters response strictly based on the acting user's permissions: Admins see `[viewer, user]`, Superadmins see `[viewer, user, admin]`.
- `changeUserRole(actorRole, targetUserId, payload)`: 
  - Pre-validates transition.
  - Queries `getActiveYear()`.
  - Performs the specialized side effects defined in the Product Plan.
  - Safely updates `profiles.global_role`.

### Routing
---

#### [NEW] [src/routes/roles.routes.ts](file:///Users/mpaishridhar/Documents/VS%20Code%20Projects/bcc-team-management-backend/src/routes/roles.routes.ts)
- `GET /users`: Authorized for `Admin+`. Calls `getRolesDashboardUsers`.
- `PATCH /:userId/role`: Authorized for `Admin+`. Validates the payload using `changeRoleSchema` and UUID schema. Calls `changeUserRole`.

## User Review Required
Does this logic correctly encapsulate the exact business rules described in the Product Plan? If so, please approve the plan so I can begin execution.
