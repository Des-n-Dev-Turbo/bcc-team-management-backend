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
