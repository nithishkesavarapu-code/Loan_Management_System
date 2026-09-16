import { z } from 'zod';

const originSchema = z.string().transform((val) => val.trim().replace(/\/+$/, '')).pipe(
  z.url().refine((value) => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
  }, 'Must be an HTTP(S) origin without a path or trailing slash.')
);

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: originSchema,
  MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\/.+/, 'Must be a MongoDB connection URI.'),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(5000),
  JWT_SECRET: z.string().min(32).refine((value) => !value.startsWith('replace-with-'), 'Generate a private secret using npm run setup.'),
  JWT_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(3600),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  UPLOAD_DIR: z.string().min(1).default(process.env.VERCEL ? '/tmp/uploads' : 'storage/uploads'),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV === 'production' && (!env.COOKIE_SECURE || !env.WEB_ORIGIN.startsWith('https://'))) {
    ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'Production requires secure cookies and an HTTPS WEB_ORIGIN.' });
  }
});

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(input: NodeJS.ProcessEnv): Environment {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    const messages = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${messages.join('\n')}`);
  }
  return result.data;
}
