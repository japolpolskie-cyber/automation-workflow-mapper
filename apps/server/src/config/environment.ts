import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const serverPackageDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  DATABASE_PATH: z.string().min(1).default('./data/automation-workflow-mapper.db'),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info')
  ,AI_PROVIDER: z.enum(['local', 'openai', 'ollama']).default('local')
  ,OPENAI_API_KEY: z.string().optional()
  ,OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1')
  ,OPENAI_MODEL: z.string().min(1).default('gpt-5.6-luna')
  ,OLLAMA_BASE_URL: z.string().url().default('http://127.0.0.1:11434')
  ,OLLAMA_MODELS: z.string().min(1).default('qwen3:8b,llama3.2:3b')
  ,K3_SCOPE_INTELLIGENCE: z.enum(['true', 'false']).default('true').transform((value) => value === 'true')
  ,K3_KNOWLEDGE_BUDGET: z.coerce.number().int().min(1_000).max(50_000).default(12_000)
  ,PLANNER_RUNTIME_MODE: z.enum(['production', 'shadow', 'distributed', 'mock']).optional()
  ,PLANNER_V2_PROMOTION_MODE: z.enum(['disabled', 'compare', 'guarded', 'enabled']).default('disabled')
  ,PLANNER_V2_ALLOW_PASS_WITH_WARNINGS: z.enum(['true', 'false']).default('false').transform((value) => value === 'true')
  ,HYBRID_RAG_MODE: z.enum(['off', 'compare', 'guarded', 'enabled']).default('off')
  ,HYBRID_RAG_RETRIEVAL_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(1_500)
  ,HYBRID_RAG_MAX_RESULTS: z.coerce.number().int().min(1).max(20).default(6)
  ,HYBRID_RAG_MAX_CHUNK_CHARS: z.coerce.number().int().min(100).max(5_000).default(800)
  ,HYBRID_RAG_MAX_CONTEXT_CHARS: z.coerce.number().int().min(500).max(20_000).default(4_000)
  ,K4_PLANNER_SHADOW: z.enum(['true', 'false']).default('true').transform((value) => value === 'true')
  ,K4_PLANNER_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(900_000).default(180_000)
  ,K4_PLANNER_MAX_OUTPUT_CHARS: z.coerce.number().int().min(1_000).max(2_000_000).default(120_000)
  ,K4_PLANNER_MAX_RETRIES: z.coerce.number().int().min(0).max(2).default(1)
  ,K4_PLANNER_CONTEXT_BUDGET: z.coerce.number().int().min(4_000).max(100_000).default(24_000)
  ,P2_DISTRIBUTED_PLANNER: z.enum(['true', 'false']).default('false').transform((value) => value === 'true')
  ,P2_DISTRIBUTED_PLANNER_TOTAL_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(1_800_000).default(300_000)
  ,P2_DISTRIBUTED_PLANNER_STAGE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(900_000).default(60_000)
  ,P2_DISTRIBUTED_PLANNER_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(1)
  ,P2_DISTRIBUTED_PLANNER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2)
  ,P2_DISTRIBUTED_PLANNER_CACHE: z.enum(['true', 'false']).default('true').transform((value) => value === 'true')
  ,P3_DISTRIBUTED_PLANNER: z.enum(['true', 'false']).default('false').transform((value) => value === 'true')
  ,P3_STAGE_A_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(900_000).default(180_000)
  ,P3_STAGE_B_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(900_000).default(240_000)
  ,P3_TOTAL_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(1_800_000).default(480_000)
  ,P3_STAGE_MAX_RETRIES: z.coerce.number().int().min(0).max(2).default(1)
  ,P3_STAGE_MAX_OUTPUT_CHARS: z.coerce.number().int().min(1_000).max(500_000).default(60_000)
  ,P3_CACHE_ENABLED: z.enum(['true', 'false']).default('true').transform((value) => value === 'true')
  ,STAGE_C_NODE_GROUNDING: z.enum(['true', 'false']).default('false').transform((value) => value === 'true')
  ,STAGE_C_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4)
  ,STAGE_C_NODE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(900_000).default(120_000)
  ,STAGE_C_MAX_RETRIES: z.coerce.number().int().min(0).max(2).default(1)
  ,STAGE_C_CACHE_ENABLED: z.enum(['true', 'false']).default('true').transform((value) => value === 'true')
  ,STAGE_C_MAX_OUTPUT_CHARS: z.coerce.number().int().min(1_000).max(500_000).default(30_000)
  ,STAGE_D_EDGE_GROUNDING: z.enum(['true', 'false']).default('false').transform((value) => value === 'true')
  ,STAGE_D_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(4)
  ,STAGE_D_EDGE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(900_000).default(120_000)
  ,STAGE_D_MAX_RETRIES: z.coerce.number().int().min(0).max(2).default(1)
  ,STAGE_D_CACHE_ENABLED: z.enum(['true', 'false']).default('true').transform((value) => value === 'true')
  ,STAGE_D_MAX_OUTPUT_CHARS: z.coerce.number().int().min(1_000).max(500_000).default(30_000)
}).superRefine((environment, context) => {
  if (environment.AI_PROVIDER === 'openai' && !environment.OPENAI_API_KEY) context.addIssue({ code: z.ZodIssueCode.custom, path: ['OPENAI_API_KEY'], message: 'Required when AI_PROVIDER is openai' });
});

export type Environment = z.infer<typeof environmentSchema>;

export function resolveDatabasePath(databasePath: string): string {
  if (databasePath === ':memory:' || isAbsolute(databasePath)) {
    return databasePath;
  }

  return resolve(serverPackageDirectory, databasePath);
}

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const result = environmentSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  }
  return {
    ...result.data,
    DATABASE_PATH: resolveDatabasePath(result.data.DATABASE_PATH),
  };
}
