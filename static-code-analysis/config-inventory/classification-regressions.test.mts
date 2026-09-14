import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { collectConfigInventory } from './index.mts'
import type { SharedContext } from 'vouchington-tooling/shared-context'

describe('config inventory classification regressions', () => {
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('keeps credentials, resource identifiers, and reviewed env vars out of DynamicConfig', async () => {
    const ctx = await makeRepoFixture({
      'backend/config/reviewed.mts': [
        'process.env.HSTS_PRELOAD',
        'process.env.RSS_CACHE_TTL_SECONDS',
        'process.env.QUEUES',
        'process.env.ANALYTICS_BACKEND',
        'process.env.DATABASE_PORT',
        'process.env.VALKEY_REQUEST_TIMEOUT_MS',
      ].join('\n'),
      'cloudflare-worker/src/rate-limit.mts': [
        'input.env.RATE_LIMITER_ANON_GET_HEAD',
        'input.env.RATE_LIMITER_BOT_MUTATING',
        'input.env.RATE_LIMITER_SERVER_ACTION',
      ].join('\n'),
      'backend/services/markdown/index.mts': ['process.env[SIDELOAD_SIGNING_KEYS_ENV]'].join('\n'),
      'ts-shared/env-contract/index.mts': [
        'export function collectTypedEnvContractEntries() {',
        '  return [{',
        "    name: 'GOOGLE_CLIENT_ID',",
        "    contractKey: 'vouchington-infra:ecs-backend-environment+ecs-worker-environment:GOOGLE_CLIENT_ID',",
        "    sourceOfTruth: 'vouchington-infra',",
        "    sensitivity: 'public',",
        "    runtimeSurfaces: ['ecs-backend-environment', 'ecs-worker-environment'],",
        '  }]',
        '}',
        'export function collectTypedEnvVarConstants() {',
        '  return {',
        "    SIDELOAD_SIGNING_KEYS_ENV: 'VOUCHA_SIDELOAD_SIGNING_KEYS',",
        '  }',
        '}',
      ].join('\n'),
      'lambdas/ses-bounce/index.mts': [
        'process.env.SES_BOUNCE_SHARED_KEY',
        'process.env.SES_AWS_ACCESS_KEY_ID',
        'process.env.SNS_SES_BOUNCE_TOPIC_ARN',
      ].join('\n'),
      'lambdas/image-resize/handler-auth.mts': 'process.env.AWS_LAMBDA_FUNCTION_NAME\n',
      'lambdas/ses-bounce/README.md': '`SES_BOUNCE_SHARED_KEY`\n',
      'playwright/tests/users/user-vouch-disavow.spec.mts': 'process.env.TMPDIR\n',
      'backend/services/example/fixtures/env.mts': 'process.env.FIXTURE_ONLY_ENV\n',
    })

    const inventory = await collectConfigInventory(ctx)

    expect(inventory.envVars).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'SES_BOUNCE_SHARED_KEY',
          classifications: expect.arrayContaining(['credential-secret']),
          docs: ['lambdas/ses-bounce/README.md'],
          readers: ['lambdas/ses-bounce/index.mts'],
        }),
        expect.objectContaining({
          name: 'SES_AWS_ACCESS_KEY_ID',
          classifications: expect.arrayContaining(['credential-secret']),
        }),
        expect.objectContaining({
          name: 'SNS_SES_BOUNCE_TOPIC_ARN',
          classifications: expect.not.arrayContaining(['dynamic-config-candidate']),
        }),
        expect.objectContaining({
          name: 'AWS_LAMBDA_FUNCTION_NAME',
          classifications: expect.not.arrayContaining(['dynamic-config-candidate']),
        }),
        expect.objectContaining({
          name: 'VOUCHA_SIDELOAD_SIGNING_KEYS',
          classifications: expect.arrayContaining(['credential-secret']),
        }),
        expect.objectContaining({
          name: 'VOUCHA_SIDELOAD_SIGNING_KEYS',
          classifications: expect.not.arrayContaining(['dynamic-config-candidate']),
        }),
        expect.objectContaining({
          name: 'HSTS_PRELOAD',
          classifications: expect.not.arrayContaining(['dynamic-config-candidate']),
          reviewReason: expect.stringContaining('environment-scoped'),
        }),
        expect.objectContaining({
          name: 'QUEUES',
          classifications: expect.not.arrayContaining(['dynamic-config-candidate']),
          reviewReason: expect.stringContaining('Worker process topology selector'),
        }),
        expect.objectContaining({
          name: 'ANALYTICS_BACKEND',
          classifications: expect.not.arrayContaining(['dynamic-config-candidate']),
          reviewReason: expect.stringContaining('Analytics backend selector'),
        }),
        expect.objectContaining({
          name: 'DATABASE_PORT',
          classifications: expect.not.arrayContaining(['dynamic-config-candidate']),
          reviewReason: expect.stringContaining('Postgres connection port'),
        }),
        expect.objectContaining({
          name: 'VALKEY_REQUEST_TIMEOUT_MS',
          classifications: expect.not.arrayContaining(['dynamic-config-candidate']),
          reviewReason: expect.stringContaining('read at client construction'),
        }),
        expect.objectContaining({
          name: 'GOOGLE_CLIENT_ID',
          classifications: expect.not.arrayContaining(['dynamic-config-candidate']),
        }),
        expect.objectContaining({
          name: 'RATE_LIMITER_ANON_GET_HEAD',
          classifications: expect.not.arrayContaining(['dynamic-config-candidate']),
          reviewReason: expect.stringContaining('Cloudflare RateLimiter binding'),
        }),
        expect.objectContaining({
          name: 'RATE_LIMITER_BOT_MUTATING',
          classifications: expect.not.arrayContaining(['dynamic-config-candidate']),
          reviewReason: expect.stringContaining('Cloudflare RateLimiter binding'),
        }),
        expect.objectContaining({
          name: 'RATE_LIMITER_SERVER_ACTION',
          classifications: expect.not.arrayContaining(['dynamic-config-candidate']),
          reviewReason: expect.stringContaining('Cloudflare RateLimiter binding'),
        }),
      ]),
    )
    expect(inventory.envVars).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'SES_BOUNCE_SHARED_KEY',
          deployment: ['lambdas/ses-bounce/README.md'],
        }),
        expect.objectContaining({ name: 'TMPDIR' }),
        expect.objectContaining({ name: 'FIXTURE_ONLY_ENV' }),
      ]),
    )
  })

  it('keeps documentation references out of source buckets', async () => {
    const ctx = await makeRepoFixture({
      'backend/modules/queue-config/concurrency.mts': [
        "const ENV_PREFIX = 'WORKER_CONCURRENCY_'",
        'function readPositiveInt(env: NodeJS.ProcessEnv, name: string): number | null {',
        '  return env[name] == null ? null : 1',
        '}',
        'readPositiveInt(process.env, `${ENV_PREFIX}${normalizeName(name)}`)',
        "parseEnvPositiveInt('OPENAI_RPM', 60)",
      ].join('\n'),
      'backend/test-helpers/examples.glide-mq-testing.md':
        'Deprecated example: `if (process.env.BULLMQ_INLINE_MODE) {}`\n',
      'dev/CLAUDE.md': '`WORKER_CONCURRENCY_MAX`\n`WORKER_CONCURRENCY_SCALE`\n',
      'docs/overview/infrastructure/environment-variables.md':
        '`ARG`\n`ENV`\n`WORKER_CONCURRENCY_MAX`\n`WORKER_CONCURRENCY_BLOOM_FILTERS`\n./dev/config-inventory\n',
      'ts-shared/env-contract/index.mts': [
        'export function collectTypedEnvVarConstants() {',
        '  return {',
        "    ENV_PREFIX: 'WORKER_CONCURRENCY_',",
        '  }',
        '}',
      ].join('\n'),
    })

    const inventory = await collectConfigInventory(ctx)

    expect(inventory.envVars).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'OPENAI_RPM',
          readers: ['backend/modules/queue-config/concurrency.mts'],
        }),
        expect.objectContaining({
          name: 'WORKER_CONCURRENCY_BLOOM_FILTERS',
          readers: ['backend/modules/queue-config/concurrency.mts'],
        }),
      ]),
    )
    expect(inventory.envVars).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'ARG' }),
        expect.objectContaining({ name: 'ENV' }),
        expect.objectContaining({ name: 'BULLMQ_INLINE_MODE' }),
        expect.objectContaining({
          name: 'WORKER_CONCURRENCY_MAX',
          localSetup: ['dev/CLAUDE.md'],
        }),
        expect.objectContaining({ name: 'WORKER_CONCURRENCY_SCALE' }),
      ]),
    )
  })

  async function makeRepoFixture(files: Record<string, string>): Promise<SharedContext> {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-config-classification-'))
    testDirs.push(dir)
    const trackedFiles = Object.keys(files)
    for (const [file, content] of Object.entries(files)) {
      await mkdir(join(dir, file, '..'), { recursive: true })
      await writeFile(join(dir, file), content)
    }
    return {
      repoRoot: dir,
      isInsideGitRepo: true,
      trackedFiles,
      trackedFileSet: new Set(trackedFiles),
    }
  }
})
