import { z } from 'zod';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env file: rely on the real environment, as in Docker and production.
}

const env = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().optional(),
    TEST_DATABASE_URL: z.string().optional(),
    OTP_SECRET: z.string().optional(),
    GROQ_API_KEY: z.string().optional(),
    AI_MODEL: z.string().optional(),
    DEMO_MODE: z.string().optional(),
  })
  .parse(process.env);

const isTest = env.NODE_ENV === 'test';

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  isProduction: env.NODE_ENV === 'production',
  isTest,
  port: env.PORT,
  // Tests only ever touch TEST_DATABASE_URL, so running them cannot wipe a development database.
  databaseUrl: isTest ? (env.TEST_DATABASE_URL ?? '') : required('DATABASE_URL', env.DATABASE_URL),
  otpSecret: isTest ? 'test-only-secret-not-used-anywhere-else' : required('OTP_SECRET', env.OTP_SECRET),
  groqApiKey: env.GROQ_API_KEY || undefined,
  aiModel: env.AI_MODEL || 'openai/gpt-oss-120b',
  demoMode: env.DEMO_MODE === 'true',
};
