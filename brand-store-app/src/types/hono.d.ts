import { Context, Next } from 'hono';

declare module 'hono' {
  interface ContextVariableMap {
    user: {
      id: string;
      email: string;
      role: 'admin' | 'branch_admin' | 'customer';
      branchId?: string | null;
      branch_id?: string | null;
    };
    branchScope: {
      branchId: string | null;
      scope: 'pusat' | 'branch';
    };
    requestId: string;
  }
}
