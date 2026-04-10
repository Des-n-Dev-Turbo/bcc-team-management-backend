export const MAX_YEAR_REQUEST_ATTEMPTS = 3;
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 50;
export const PERMANENT_BAN_DURATION = "876000h"; // 100 years

export enum Table {
  Years = "years",
  Teams = "teams",
  Profiles = "profiles",
  YearParticipants = "year_participants",
  TeamMemberships = "team_memberships",
  Tasks = "tasks",
  ScoreEvents = "score_events",
  AuditLogs = "audit_logs",
  YearAccess = "year_access",
}
