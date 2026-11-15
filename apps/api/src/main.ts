import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { createApplication } from './application.js';
import { readEnvironment } from './config/environment.js';
import { startupErrorMessage } from './config/startup-error.js';

async function bootstrap() {
  const envPath = fileURLToPath(new URL('../.env', import.meta.url));
  if (existsSync(envPath)) loadEnvFile(envPath);
  const config = readEnvironment();
  const app = await createApplication();
  try {
    await app.listen(config.PORT, '127.0.0.1');
  } catch (error) {
    await app.close();
    throw error;
  }
}

bootstrap().catch((error: unknown) => {
  console.error(`API startup failed. ${startupErrorMessage(error)}`);
  process.exitCode = 1;
});
