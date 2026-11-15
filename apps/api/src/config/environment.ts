import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export class ConfigurationError extends Error {
  constructor(fields: string[]) {
    super(`Invalid server configuration: ${fields.join(', ')}`);
    this.name = 'ConfigurationError';
  }
}

export function readEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    // Report field names only; never echo environment values or credentials.
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new ConfigurationError(fields);
  }
  return result.data;
}
