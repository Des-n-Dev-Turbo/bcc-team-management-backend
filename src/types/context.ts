import type { Role } from './role.ts';
import { YearAccessStatus } from './year_access.ts';

export type AppContext = {
  Variables: {
    userId: string;
    profile: {
      id: string;
      global_role: Role;
    };
    yearAccess: {
      id: string;
      user_id: string;
      year_id: string;
      status: YearAccessStatus;
    } | null;
  };
};
