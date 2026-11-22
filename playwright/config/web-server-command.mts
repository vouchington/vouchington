import type { ReporterDescription } from '@playwright/test'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createReporter, definedEnv } from 'vouchington-tooling/playwright-config'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const apiTestServerGuardReporter = join(
  repoRoot,
  'playwright',
  'config',
  'api-test-server-guard-reporter.mts',
)
export const otelRegisterPreload = join(repoRoot, 'dev', 'otel-register.mts')

export function createVouchaReporter(junitOutputFile: string, ci: boolean): ReporterDescription[] {
  return createReporter({ junitOutputFile, ci, extraReporters: [[apiTestServerGuardReporter]] })
}

export function imageLambdaEnv(source: NodeJS.ProcessEnv, port: string): Record<string, string> {
  return definedEnv({
    ...source,
    IMAGE_LAMBDA_PORT: port,
    S3_BUCKET_IMAGES: source.S3_BUCKET_IMAGES || 'test-images',
    S3_BUCKET_RENDERS: source.S3_BUCKET_RENDERS || 'test-renders',
  })
}
