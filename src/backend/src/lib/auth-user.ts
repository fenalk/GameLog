import type { Role, UserStatus } from '@gamelog/shared';

export type AuthUser = {
  id: string;
  username: string;
  role: Role;
  status: UserStatus;
};
