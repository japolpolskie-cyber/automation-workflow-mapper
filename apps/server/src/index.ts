import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { buildApp } from './app.js';
import { loadEnvironment } from './config/environment.js';

const environmentCandidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '..', '..', '.env')];
const environmentFile = environmentCandidates.find((candidate) => existsSync(candidate));
if (environmentFile) loadEnvFile(environmentFile);
const environment = loadEnvironment();
const app = await buildApp(environment);

try {
  await app.listen({ host: environment.HOST, port: environment.PORT });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
