export type BulkFailedRow = {
  row: number;
  name?: string;
  email?: string;
  mobile?: string;
  reason: string;
};

export type BulkSucceededRow = {
  row: number;
  name: string;
  email: string;
  mobile: string;
  warning?: string;
};

export type BulkAddResult = {
  succeeded: BulkSucceededRow[];
  failed: BulkFailedRow[];
};

export type YearParticipantFilters = {
  page?: number;
  name?: string;
  email?: string;
  mobile?: string;
  sort?: "name" | "email";
  order?: "asc" | "desc";
};

export type YearParticipantRecord = {
  id: string;
  year_id: string;
  name: string;
  email: string;
  mobile: string;
  user_id: string | null;
  reg_id: string | null;
  banned: boolean;
};

export interface ParticipantBanResult {
  success: boolean;
  account_disabled: boolean;
  db_updated: boolean;
  data: YearParticipantRecord | null;
}

export interface ParticipantUnbanResult {
  success: boolean;
  auth_restored: boolean;
  restoredCompleteAccess: boolean;
  db_updated: boolean;
  data: YearParticipantRecord | null;
}
