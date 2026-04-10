import { createRemoteJWKSet, jwtVerify } from "jose";
import { getConfig } from "@/config.ts";

const config = getConfig();

const JWKS = createRemoteJWKSet(
  new URL(`${config.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
);

export async function verifySupabaseJWT(token: string) {
  const { payload } = await jwtVerify(token, JWKS, {
    algorithms: ["ES256"],
    issuer: `${config.SUPABASE_URL}/auth/v1`,
    audience: "authenticated",
  });

  return payload;
}
