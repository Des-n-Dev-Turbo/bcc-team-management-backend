// src/middleware/jwt.ts
// src/middleware/jwt.ts

import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { Context, Next } from 'hono';
import { getConfig } from '../config.ts';

const config = getConfig();

const JWKS = createRemoteJWKSet(new URL(config.SUPABASE_JWKS_URL));

type SupabaseUser = JWTPayload & {
  sub: string;
  email?: string;
  role?: string;
};

export async function supabaseAuth(c: Context, next: Next) {
  const auth = c.req.header('Authorization');

  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing token' }, 401);
  }

  const token = auth.slice(7);

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      algorithms: ['ES256'],
      issuer: `${config.SUPABASE_URL}/auth/v1`,
      audience: 'authenticated',
    });

    const user = payload as SupabaseUser;

    c.set('userId', user.sub);
    c.set('user', user);

    await next();
  } catch (err) {
    console.error('JWT verify failed:', err);
    return c.json({ error: 'Invalid token' }, 401);
  }
}
