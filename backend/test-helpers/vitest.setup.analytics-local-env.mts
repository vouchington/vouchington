/* oxlint-disable vitest/require-top-level-describe -- registered as a Vitest setupFile; its top-level afterAll cleans up the mkdtemp'd ANALYTICS_LOCAL_DIR after the test file completes, so it cannot be wrapped in a describe block. */
import { afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { flush } from '@data-stores/analytics/backend-local'

const originalAnalyticsBackend = process.env.ANALYTICS_BACKEND
const originalAnalyticsLocalDir = process.env.ANALYTICS_LOCAL_DIR
const analyticsLocalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'analytics-service-test-'))

process.env.ANALYTICS_BACKEND = 'local'
process.env.ANALYTICS_LOCAL_DIR = analyticsLocalDir

afterAll(async () => {
  try {
    await flush()
  } finally {
    restoreEnvironment('ANALYTICS_BACKEND', originalAnalyticsBackend)
    restoreEnvironment('ANALYTICS_LOCAL_DIR', originalAnalyticsLocalDir)
    fs.rmSync(analyticsLocalDir, { recursive: true, force: true })
  }
})

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) Reflect.deleteProperty(process.env, name)
  else process.env[name] = value
}
