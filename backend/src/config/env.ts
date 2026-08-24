import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1).optional(),
  MONGODB_DATABASE: z.string().min(1).default('linkedin_ai_agent'),
  AI_PROVIDER: z.enum(['local', 'openai_compatible']).default('local'),
  AI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  AI_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).default('gpt-4o-mini'),
  AUTOMATION_MODULE: z.string().min(1).optional(),
  /** Explicit executor selection. Unset + AUTOMATION_MODULE ⇒ legacy module mode. */
  AUTOMATION_PROVIDER: z.enum(['simulation', 'playwright', 'module']).optional(),
  /** Persistent browser profile directory — lives ONLY in the executor process (flow.md §80.1). */
  LINKEDIN_BROWSER_PROFILE_PATH: z.string().min(1).optional(),
  LINKEDIN_HEADLESS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  AUTH_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(2160).default(24),
  CORS_ORIGINS: z.string().min(1).default('http://localhost:5173'),
  DNS_SERVERS: z.string().min(1).optional(),
})

export type Env = z.infer<typeof envSchema>

function loadEnvFile(): void {
  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../.env')]
  const found = candidates.find((p) => existsSync(p))
  if (found) loadDotenv({ path: found })
}

loadEnvFile()

export const env: Env = envSchema.parse(process.env)
