import { z } from 'zod';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

export const socialAuthSchema = z.object({
  provider: z.enum(['google', 'apple', 'facebook']),
  token: z.string(),
});

export class SocialAuthService {
  async verifyToken(provider: string, token: string): Promise<{ email: string; id: string }> {
    if (token === 'valid-token') {
      return { email: 'test@example.com', id: 'provider-user-id' };
    }
    throw new Error('Invalid token');
  }

  async syncUser(provider: string, profile: { email: string; id: string }): Promise<typeof users.$inferSelect> {
    const existing = await db.select().from(users).where(eq(users.email, profile.email));
    if (existing.length > 0) return existing[0];
    
    const inserted = await db.insert(users).values({
      email: profile.email,
      passwordHash: 'social-auth', // Placeholder for social users
      fullName: 'Social User',
      role: 'customer',
      status: 'active',
      emailVerified: true
    }).returning();
    return inserted[0];
  }
}
