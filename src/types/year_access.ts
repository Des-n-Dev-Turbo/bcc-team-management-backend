export enum YearAccessStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export type YearAccessPendingEntry = {
  id: string;
  user_id: string;
  year_id: string;
  status: YearAccessStatus;
  name: string | null;
  email: string | null;
  previous_rejections: number;
};

export type YearAccessEntry = {
  id: string;
  user_id: string;
  year_id: string;
  status: YearAccessStatus;
  name: string | null;
  email: string | null;
};

export type YearAccessRejectedEntry = {
  user_id: string;
  year_id: string;
  status: YearAccessStatus;
  name: string | null;
  email: string | null;
  rejection_count: number;
  last_rejected_at: string | null;
};

export type YearAccessRequestsResult = {
  pending: YearAccessPendingEntry[];
  approved: YearAccessEntry[];
  rejected: YearAccessRejectedEntry[];
};
