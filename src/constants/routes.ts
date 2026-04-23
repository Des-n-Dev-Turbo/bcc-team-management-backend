export const YearRoutes = {
  Base: "/years",
  CreateYear: "/",
  GetYears: "/",
  Lock: "/:yearId/lock",
  Participants: "/:yearId/participants",
  GetTeamLeads: "/:yearId/team-leads",
  TeamParticipants: "/:yearId/teams",
} as const;

export const TeamRoutes = {
  Base: "/teams",
  CreateTeam: "/create",
  CopyTeams: "/year/:yearId/copy",
  EditTeamById: "/:teamId",
  GetTeams: "/",
} as const;

export const TeamMembershipRoutes = {
  Base: "/team_memberships",
  AddParticipant: "/",
  Transfer: "/transfer",
  RemoveById: "/:membershipId",
  PromoteById: "/:membershipId/promote",
  DemoteById: "/:membershipId/demote",
} as const;

export const YearAccessRoutes = {
  Base: "/year-access",
  RequestAccess: "/",
  GetAccessRequests: "/",
  Approve: "/:id/approve",
  Reject: "/:id/reject",
  Remove: "/:userId/remove",
  GetUsers: "/users",
} as const;

export const ProfileRoutes = {
  Base: "/profile",
  BootstrapProfile: "/bootstrap",
  Me: "/me",
} as const;

export const RolesRoutes = {
  Base: "/roles",
  GetUsers: "/users",
  ChangeRole: "/:userId/role",
} as const;

export const ParticipantRoutes = {
  AddYearParticipant: "/",
  AddYearParticipantBulk: "/bulk",
  GetYearParticipants: "/",
  Ban: "/:participantId/ban",
  Unban: "/:participantId/unban",
  Disqualify: "/:participantId/disqualify",
  Undisqualify: "/:participantId/undisqualify",
  UpdateYearParticipant: "/:participantId",
  GetTeamParticipants: "/:teamId/participants",
} as const;
