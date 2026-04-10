import type { Role } from "./role.ts";
import type { YearAccessStatus } from "./year_access.ts";

export type AppContext = {
  Variables: {
    userId: string;
    profile: {
      id: string;
      global_role: Role;
    };
    email: string | null;
    name: string | null;
    yearAccess: {
      id: string;
      user_id: string;
      year_id: string;
      status: YearAccessStatus;
    } | null;
  };
};
