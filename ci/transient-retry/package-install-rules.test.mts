import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('playwright-setup-backend-pnpm-activation-timeout', () => {
  const setupBackendPnpmActivationTimeoutLog = [
    '##[group]Run ./.github/actions/setup-backend',
    'with:',
    '  force-install: true',
    'node: /home/runner/actions-runners/1/_work/_tool/node/26.0.0/x64/bin/node v26.0.0',
    '##[error]The action has timed out.',
    'Stop and remove container: c9706705a53d489da50390110724e2e1_valkeyvalkeybundlelatest_aacb89',
    'Cleaning up orphan processes',
    'Terminate orphan process: pid (531182) (npm install pnpm@11.0.3)',
  ].join('\n')

  const failedJobLogs = (log: string) => () =>
    Promise.resolve(
      new Map([
        ['test-playwright / playwright-tests (2)', log],
        ['tests', 'One or more required jobs failed or were cancelled'],
        ['build', 'One or more build jobs failed or were cancelled'],
      ]),
    )

  it('matches a Playwright shard setup-backend timeout during pnpm activation', async () => {
    const ctx = makeCtx({
      failedJobNames: ['test-playwright / playwright-tests (2)', 'tests', 'build'],
      failedJobLogs: failedJobLogs(setupBackendPnpmActivationTimeoutLog),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('playwright-setup-backend-pnpm-activation-timeout')
  })

  it('does not hide an independent reusable Patch Coverage failure', async () => {
    const ctx = makeCtx({
      failedJobNames: [
        'test-playwright / playwright-tests (2)',
        'Patch Coverage / Patch Coverage',
        'tests',
        'build',
      ],
      failedJobLogs: failedJobLogs(setupBackendPnpmActivationTimeoutLog),
    })
    expect((await decide(ctx, RULES)).decision).toBe('dispatch')
  })

  it('does not match a setup-backend timeout without the pnpm install orphan marker', async () => {
    const ctx = makeCtx({
      failedJobNames: ['test-playwright / playwright-tests (2)', 'tests', 'build'],
      failedJobLogs: failedJobLogs(
        [
          '##[group]Run ./.github/actions/setup-backend',
          'node: /home/runner/actions-runners/1/_work/_tool/node/26.0.0/x64/bin/node v26.0.0',
          '##[error]The action has timed out.',
          'Cleaning up orphan processes',
        ].join('\n'),
      ),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match after the retry cap is exhausted', async () => {
    const ctx = makeCtx({
      runAttempt: 2,
      failedJobNames: ['test-playwright / playwright-tests (2)', 'tests', 'build'],
      failedJobLogs: failedJobLogs(setupBackendPnpmActivationTimeoutLog),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})

describe('postgres-schema-setup-backend-pnpm-activation-timeout', () => {
  const setupBackendPnpmActivationTimeoutLog = [
    '##[group]Run ./.github/actions/setup-backend',
    'with:',
    '  force-install: true',
    'node: /home/runner/actions-runners/2/_work/_tool/node/26.0.0/x64/bin/node v26.0.0',
    '##[error]The action has timed out.',
    'Run node data-stores/psql/schema-snapshot/generate.mts --check',
    'Error: The PostgreSQL schema snapshot is stale. Regenerate it against a PostgreSQL 18 database',
    'Cleaning up orphan processes',
    'Terminate orphan process: pid (1376408) (npm install pnpm@11.0.3)',
  ].join('\n')

  const failedJobLogs = (log: string) => () =>
    Promise.resolve(new Map([['postgres-schema-tests / postgres-schema-tests', log]]))

  it('matches Main CI backend PostgreSQL schema setup-backend timeout during pnpm activation', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (backend)',
      failedJobNames: ['postgres-schema-tests / postgres-schema-tests'],
      failedJobLogs: failedJobLogs(setupBackendPnpmActivationTimeoutLog),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('playwright-setup-backend-pnpm-activation-timeout')
  })

  it('does not match real PostgreSQL snapshot drift without the setup-backend orphan marker', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (backend)',
      failedJobNames: ['postgres-schema-tests / postgres-schema-tests'],
      failedJobLogs: failedJobLogs(
        [
          'Run node data-stores/psql/schema-snapshot/generate.mts --check',
          'Error: The PostgreSQL schema snapshot is stale. Regenerate it against a PostgreSQL 18 database',
          '##[error]Process completed with exit code 1.',
        ].join('\n'),
      ),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match mixed Main CI backend failures', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (backend)',
      failedJobNames: [
        'postgres-schema-tests / postgres-schema-tests',
        'test-backend-unit / backend-tests (1)',
      ],
      failedJobLogs: failedJobLogs(setupBackendPnpmActivationTimeoutLog),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match after the retry cap is exhausted', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (backend)',
      runAttempt: 2,
      failedJobNames: ['postgres-schema-tests / postgres-schema-tests'],
      failedJobLogs: failedJobLogs(setupBackendPnpmActivationTimeoutLog),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match for a non-matching workflow (e.g. CI)', async () => {
    const ctx = makeCtx({
      workflowName: 'CI',
      failedJobNames: ['postgres-schema-tests / postgres-schema-tests'],
      failedJobLogs: failedJobLogs(setupBackendPnpmActivationTimeoutLog),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})

describe('main-checks-ts-shared-setup-backend-pnpm-activation-timeout', () => {
  const tsSharedPnpmActivationTimeoutLog = [
    `Uses: jonathanong/filaments/.github/workflows/tests-ts-shared.yml@refs/heads/main (${'a'.repeat(40)})`,
    '##[group]Run ./.github/actions/setup-backend',
    'with:',
    '  runner-lifecycle: persistent',
    '##[group]Run set -euo pipefail',
    'node: /home/runner/actions-runners/2/_work/_tool/node/26.0.0/x64/bin/node v26.0.0',
    '##[error]The action has timed out.',
    'Cleaning up orphan processes',
    'Terminate orphan process: pid (3044076) (npm install pnpm@11.13.1)',
  ].join('\n')

  const failedJobLogs = (log: string) => () =>
    Promise.resolve(new Map([['ts-shared-tests / ts-shared', log]]))

  it('matches a Main CI checks ts-shared setup-backend timeout during pnpm activation', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (checks)',
      failedJobNames: ['ts-shared-tests / ts-shared'],
      failedJobLogs: failedJobLogs(tsSharedPnpmActivationTimeoutLog),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('playwright-setup-backend-pnpm-activation-timeout')
  })

  it('does not match a ts-shared setup-backend timeout without the pnpm install orphan marker', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (checks)',
      failedJobNames: ['ts-shared-tests / ts-shared'],
      failedJobLogs: failedJobLogs(
        [
          '##[group]Run ./.github/actions/setup-backend',
          'node: /home/runner/actions-runners/2/_work/_tool/node/26.0.0/x64/bin/node v26.0.0',
          '##[error]The action has timed out.',
          'Cleaning up orphan processes',
        ].join('\n'),
      ),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match mixed Main CI checks failures', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (checks)',
      failedJobNames: [
        'ts-shared-tests / ts-shared',
        'static-code-analysis / static-code-analysis',
      ],
      failedJobLogs: failedJobLogs(tsSharedPnpmActivationTimeoutLog),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match after the retry cap is exhausted', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (checks)',
      runAttempt: 2,
      failedJobNames: ['ts-shared-tests / ts-shared'],
      failedJobLogs: failedJobLogs(tsSharedPnpmActivationTimeoutLog),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
