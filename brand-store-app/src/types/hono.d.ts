import { Context, Next } from 'hono';

declare module 'hono' {
  interface ContextVariableMap {
    user: {
      id: string;
      email: string;
      role: 'admin' | 'customer';
    };
    requestId: string;
  }
}

