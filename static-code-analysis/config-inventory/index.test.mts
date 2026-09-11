import { rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'

import { checkConfigInventoryPolicy, collectConfigInventory } from './index.mts'
import { GENERIC_REVIEW_REASON } from './review-reasons.mts'
import { makeRepoFixture } from './test-helpers/repo-fixture.mts'

describe('config inventory', () => {
  const testDirs: string[] = []
  const environmentVariablesIndexDoc = 'docs/overview/infrastructure/environment-variables.md'
  const environmentVariablesReference =
    'docs/overview/infrastructure/reference-environment-variables-test.md'
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('collects env vars, DynamicConfig namespaces, and package-manager gates', async () => {
    const fixture = await makeRepoFixture({
      'backend/services/example/config.mts': `
        const enabled = process.env.FEATURE_EXAMPLE_ENABLED === 'true'
        const { WORKFLOW_RUN_ID, GH_TOKEN: tokenAlias } = process.env
        const sentryDsn = getNonEmptyEnv('SENTRY_DSN')
        export const exampleConfig = new DynamicConfig({ key: 'example-config', fieldTypes: {}, defaultFields: {} })
      `,
      'backend/modules/token-secrets/hash.mts': `
        const HASH_ENV = 'VOUCHA_OTP_TOKEN_HASH_SECRET'
        export const secret = process.env[HASH_ENV]?.trim()
      `,
      'backend/modules/queue-config/concurrency.mts': `
        const MAX_ENV = 'WORKER_CONCURRENCY_MAX'
        const max = readPositiveInt(env, MAX_ENV)
        function readPositiveInt(env: NodeJS.ProcessEnv, name: string): number | null {
          return Number.parseInt(env[name] ?? '', 10)
        }
      `,
      'backend/services/markdown/index.mts': `
        import { SIDELOAD_SIGNING_KEYS_ENV } from '@ts-shared/url-signing'
        export const keys = process.env[SIDELOAD_SIGNING_KEYS_ENV]
      `,
      'cloudflare-worker/scripts/wrangler/env.mts': `
        const workerPort = requireEnv('WORKER_PORT')
        function requireEnv(name: 'WORKER_PORT') {
          return process.env[name]
        }
      `,
      'cloudflare-worker/src/request-config.mts':
        'export const ttl = env.SITEMAP_CACHE_TTL_SECONDS\n',
      'cloudflare-worker/wrangler.local.jsonc':
        '{\n  "vars": {\n    "GEO_BLOCKED_COUNTRIES": "[]"\n  }\n}\n',
      'lambdas/bedrock-batch-bridge/index.mts': 'const url = process.env.BACKEND_URL\n',
      'lambdas/bedrock-batch-bridge/__tests__/index.test.mts':
        'process.env.BACKEND_URL = "https://example.com"\n',
      'static-code-analysis/config-inventory/index.test.mts':
        'const synthetic = process.env.SYNTHETIC_FIXTURE_ENV\n',
      'docs/fixtures/config-inventory/example.md': '`CLOUDFLARE_API_TOKEN`\n',
      '.github/workflows/ci.yml':
        'on:\n  workflow_call:\n    secrets:\n      ECS_SUBNET_IDS:\n        required: true\nenv:\n  WORKFLOW_FROM_YAML: true',
      '.github/workflows/ci.test.mts': 'const env = { RUNNER_TOOL_CACHE: "/tmp" }\n',
      'dev/initialize': "RED='red'\nexport REAL_DEV_ENV=1\n",
      'web/Dockerfile': 'ARG STRIP_TEST_IDS=false\nENV RUNTIME_CONTAINER_PORT=3000\n',
      'backend/services/dynamic-config-admin/registry.mts': `
        export const dynamicConfigRegistry = [{ namespace: 'example-config' }]
      `,
      'ts-shared/url-signing/index.mts':
        "export const SIDELOAD_SIGNING_KEYS_ENV = 'VOUCHA_SIDELOAD_SIGNING_KEYS'\n",
      'ts-shared/env-contract/index.mts': `
        export function collectTypedEnvContractEntries() {
          return [
            { name: 'CF_WORKER_SECRET', contractKey: 'local-init:local-worktree:CF_WORKER_SECRET', sourceOfTruth: 'local-init', sensitivity: 'secret', runtimeSurfaces: ['local-web', 'local-worker', 'local-worktree'] },
            { name: 'CF_WORKER_SECRET', contractKey: 'vouchington-infra:ecs-backend-secret+ecs-worker-secret:CF_WORKER_SECRET', sourceOfTruth: 'vouchington-infra', sensitivity: 'secret', runtimeSurfaces: ['ecs-backend-secret', 'ecs-worker-secret'] },
            { name: 'CF_WORKER_SECRET', contractKey: 'vouchington-infra:ecs-web-secret:CF_WORKER_SECRET', sourceOfTruth: 'vouchington-infra', sensitivity: 'secret', runtimeSurfaces: ['ecs-web-secret'] },
            { name: 'STRIPE_SECRET_KEY', contractKey: 'vouchington-infra:ecs-backend-secret+ecs-worker-secret:STRIPE_SECRET_KEY', sourceOfTruth: 'vouchington-infra', sensitivity: 'secret', runtimeSurfaces: ['ecs-backend-secret', 'ecs-worker-secret'] },
          ]
        }
        export function collectTypedEnvVarConstants() {
          return {
            HASH_ENV: 'VOUCHA_OTP_TOKEN_HASH_SECRET',
            MAX_ENV: 'WORKER_CONCURRENCY_MAX',
            SIDELOAD_SIGNING_KEYS_ENV: 'VOUCHA_SIDELOAD_SIGNING_KEYS',
          }
        }
      `,
      'backend/config/stripe.mts': 'const value = process.env.STRIPE_SECRET_KEY\n',
      'package.json': '{"scripts":{"coverage":"VITEST_COVERAGE_SCOPE=tooling vitest"}}',
      '.env.example':
        'export FEATURE_EXAMPLE_ENABLED=\nexport API_KEY_CHECKSUM_SECRET=\nexport PORT=\n',
      [environmentVariablesIndexDoc]:
        '`FEATURE_EXAMPLE_ENABLED`\nCI appears in specifications but should not match.\nsome/PORT and MY-PORT-ENV should not match.\n./dev/config-inventory\n',
      [environmentVariablesReference]: '`LATE_ENV_VAR`\n',
      'docs/overview/architecture/dynamic-config.md': './dev/config-inventory\n',
      'docs/development/local-env-vars.md': './dev/config-inventory\n',
      'dev/README.md': '[Command Catalog](reference-command-catalog.md)\n',
      'dev/reference-command-catalog.md': './dev/config-inventory\n',
      'static-code-analysis/README.md': './dev/config-inventory\n',
      'web/late.mts': 'const value = process.env.LATE_ENV_VAR\n',
      'pnpm-workspace.yaml':
        'allowBuilds:\r\n  sharp: true\r\npackageExtensions:\r\n  # comment\r\n  "@ghostery/adblocker-puppeteer@*":\r\n    peerDependenciesMeta:\r\n      puppeteer:\r\n        optional: true\r\nminimumReleaseAge: 2880\r\nminimumReleaseAgeExclude:\r\n  - valkyries',
    })

    testDirs.push(fixture.dir)
    const inventory = await collectConfigInventory(fixture.ctx)

    expect(inventory.envVars).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'FEATURE_EXAMPLE_ENABLED',
          classifications: expect.arrayContaining([
            'dynamic-config-candidate',
            'feature-opt-in',
            'local-startup-required',
          ]),
        }),
        expect.objectContaining({
          name: 'API_KEY_CHECKSUM_SECRET',
          classifications: expect.arrayContaining(['credential-secret', 'local-startup-required']),
        }),
        expect.objectContaining({
          name: 'WORKFLOW_RUN_ID',
          readers: ['backend/services/example/config.mts'],
        }),
        expect.objectContaining({
          name: 'VITEST_COVERAGE_SCOPE',
          packageGates: ['package.json'],
        }),
        expect.objectContaining({
          name: 'LATE_ENV_VAR',
          docs: [environmentVariablesReference],
          readers: ['web/late.mts'],
        }),
        expect.objectContaining({
          name: 'STRIPE_SECRET_KEY',
          classifications: expect.arrayContaining(['credential-secret']),
        }),
        expect.objectContaining({
          name: 'SENTRY_DSN',
          readers: ['backend/services/example/config.mts'],
        }),
        expect.objectContaining({
          name: 'VOUCHA_OTP_TOKEN_HASH_SECRET',
          readers: ['backend/modules/token-secrets/hash.mts'],
        }),
        expect.objectContaining({
          name: 'WORKER_CONCURRENCY_MAX',
          readers: ['backend/modules/queue-config/concurrency.mts'],
        }),
        expect.objectContaining({
          name: 'WORKER_PORT',
          readers: ['cloudflare-worker/scripts/wrangler/env.mts'],
        }),
        expect.objectContaining({
          name: 'SITEMAP_CACHE_TTL_SECONDS',
          readers: ['cloudflare-worker/src/request-config.mts'],
        }),
        expect.objectContaining({
          name: 'GEO_BLOCKED_COUNTRIES',
          localSetup: ['cloudflare-worker/wrangler.local.jsonc'],
        }),
        expect.objectContaining({
          name: 'BACKEND_URL',
          deployment: ['lambdas/bedrock-batch-bridge/index.mts'],
          readers: ['lambdas/bedrock-batch-bridge/index.mts'],
        }),
        expect.objectContaining({
          name: 'VOUCHA_SIDELOAD_SIGNING_KEYS',
          readers: ['backend/services/markdown/index.mts'],
        }),
        expect.objectContaining({
          name: 'CF_WORKER_SECRET',
          contractKeys: expect.arrayContaining([
            'local-init:local-worktree:CF_WORKER_SECRET',
            'vouchington-infra:ecs-backend-secret+ecs-worker-secret:CF_WORKER_SECRET',
            'vouchington-infra:ecs-web-secret:CF_WORKER_SECRET',
          ]),
          sensitivity: 'secret',
          sourceOfTruth: 'local-init',
          runtimeSurfaces: expect.arrayContaining([
            'ecs-backend-secret',
            'ecs-web-secret',
            'ecs-worker-secret',
            'local-web',
            'local-worker',
            'local-worktree',
          ]),
        }),
        expect.objectContaining({
          name: 'STRIPE_SECRET_KEY',
          classifications: expect.arrayContaining(['deploy-only']),
          contractKey: 'vouchington-infra:ecs-backend-secret+ecs-worker-secret:STRIPE_SECRET_KEY',
          sourceOfTruth: 'vouchington-infra',
          sensitivity: 'secret',
        }),
        expect.objectContaining({
          name: 'WORKFLOW_FROM_YAML',
          workflows: ['.github/workflows/ci.yml'],
        }),
        expect.objectContaining({
          name: 'REAL_DEV_ENV',
          localSetup: ['dev/initialize'],
        }),
        expect.objectContaining({
          name: 'PORT',
          localSetup: ['.env.example'],
        }),
        expect.objectContaining({
          name: 'STRIP_TEST_IDS',
          classifications: expect.arrayContaining(['build-time']),
          dockerBuildArgs: ['web/Dockerfile'],
          deployment: ['web/Dockerfile'],
        }),
        expect.objectContaining({
          name: 'RUNTIME_CONTAINER_PORT',
          classifications: expect.not.arrayContaining(['build-time']),
          deployment: ['web/Dockerfile'],
        }),
      ]),
    )
    expect(inventory.envVars).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'CI', docs: [environmentVariablesIndexDoc] }),
        expect.objectContaining({ name: 'CLOUDFLARE_API_TOKEN' }),
        expect.objectContaining({ name: 'RUNNER_TOOL_CACHE' }),
        expect.objectContaining({ name: 'SYNTHETIC_FIXTURE_ENV' }),
        expect.objectContaining({ name: 'ECS_SUBNET_IDS' }),
        expect.objectContaining({ name: 'RED' }),
        expect.objectContaining({ name: 'PORT', docs: [environmentVariablesIndexDoc] }),
        expect.objectContaining({
          name: 'BACKEND_URL',
          deployment: ['lambdas/bedrock-batch-bridge/__tests__/index.test.mts'],
        }),
      ]),
    )
    expect(inventory.dynamicConfigs).toContainEqual({
      namespace: 'example-config',
      definitionFiles: ['backend/services/example/config.mts'],
      registryFiles: ['backend/services/dynamic-config-admin/registry.mts'],
    })
    expect(inventory.packageGates.map(row => row.name)).toEqual(
      expect.arrayContaining(['allowBuilds', 'packageExtensions', 'minimumReleaseAge']),
    )
  })

  it('reports missing docs cross-links and unregistered DynamicConfig namespaces', async () => {
    const fixture = await makeRepoFixture({
      'backend/services/example/config.mts': `
        export const exampleConfig = new DynamicConfig({ key: 'missing-config', fieldTypes: {}, defaultFields: {} })
      `,
      [environmentVariablesIndexDoc]: './dev/config-inventory\n`AMBIGUOUS_SETTING`\n',
      'docs/overview/architecture/dynamic-config.md': './dev/config-inventory\n',
      'docs/development/local-env-vars.md': 'no link\n',
      'dev/README.md': 'no link\n',
      'dev/reference-command-catalog.md': 'no link\n',
      'static-code-analysis/README.md': 'no link\n',
      'pnpm-workspace.yaml': 'minimumReleaseAge: 2880\n',
    })

    testDirs.push(fixture.dir)
    const inventory = await collectConfigInventory(fixture.ctx)
    const errors = (await checkConfigInventoryPolicy(fixture.ctx)).errors

    expect(inventory.envVars).toContainEqual(
      expect.objectContaining({
        name: 'AMBIGUOUS_SETTING',
        classifications: ['review-required'],
        reviewReason: GENERIC_REVIEW_REASON,
      }),
    )
    expect(errors).toEqual(
      expect.arrayContaining([
        'DynamicConfig namespace missing-config is not registered in admin inventory',
        'env var AMBIGUOUS_SETTING needs a review reason for ambiguous classification',
      ]),
    )
  })
})
