// src/config.ts
/**
 * Central configuration loader for the backend.
 * Ensures environment variables are loaded, validated, typed, and accessible.
 */

import '@std/dotenv/load'; // Loads .env automatically in local dev

// Define TypeScript type for the config object
export interface AppConfig {
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string; // server-side privileged key
  SUPABASE_JWKS_URL: string;

  SMTP_FROM_NAME: string;
  SMTP_FROM_EMAIL: string;
  BREVO_API_KEY: string;

  API_ENV: 'development' | 'production';
  APP_URL: string;

  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
}

// Helper to read environment vars with validation
function requireEnv(key: string, fallback?: string): string {
  const value = Deno.env.get(key) ?? fallback;
  if (!value) {
    throw new Error(`❌ Missing required environment variable: ${key}`);
  }
  return value;
}

// Cache loaded config (singleton)
let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;

  cached = {
    SUPABASE_URL: requireEnv('SUPABASE_URL'),
    SUPABASE_SECRET_KEY: requireEnv('SUPABASE_SECRET_KEY'),

    SUPABASE_JWKS_URL: requireEnv('SUPABASE_JWKS_URL'),

    SMTP_FROM_NAME: requireEnv('SMTP_FROM_NAME', 'BCC Team Manager'),
    SMTP_FROM_EMAIL: requireEnv('SMTP_FROM_EMAIL'),
    BREVO_API_KEY: requireEnv('BREVO_API_KEY'),

    API_ENV: requireEnv('API_ENV', 'development') as
      | 'development'
      | 'production',
    APP_URL: requireEnv('APP_URL', 'http://localhost:8000'),

    LOG_LEVEL: requireEnv('LOG_LEVEL', 'debug') as
      | 'debug'
      | 'info'
      | 'warn'
      | 'error',
  };

  return cached;
}
