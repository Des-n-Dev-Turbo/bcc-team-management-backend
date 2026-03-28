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
  sort?: 'name' | 'email';
  order?: 'asc' | 'desc';
};
