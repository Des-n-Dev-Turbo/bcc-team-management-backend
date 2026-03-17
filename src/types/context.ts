import type { Role } from '@/types/role.ts';

export type AppContext = {
  Variables: {
    userId: string;
    profile: {
      id: string;
      global_role: Role;
    };
  };
};
