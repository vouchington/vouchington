import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify, stripVTControlCharacters } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const vitestCliPath = join(
  dirname(fileURLToPath(import.meta.resolve('vitest/package.json'))),
  'vitest.mjs',
)
const observerPath = join(repoRoot, 'backend/data-stores/psql/shared-db-scope-observer.mts')
const guardSetupPath = join(repoRoot, 'test-helpers/vitest.setup.shared-db-scope-guard.mts')
const guardRunnerPath = join(repoRoot, 'test-helpers/vitest.runner.shared-db-scope-guard.mts')
const fixtureDirectories: string[] = []

type FixtureFile = { name: string; source: string }

async function runFixture(
  files: FixtureFile[],
  setupSource?: string,
): Promise<{ exitCode: number; output: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'voucha-shared-db-scope-guard-'))
  fixtureDirectories.push(directory)
  const setupPath = join(directory, 'fixture-setup.mts')
  if (setupSource) await writeFile(setupPath, setupSource)
  await writeFile(
    join(directory, 'vitest.config.mts'),
    `export default { test: {
  pool: 'forks', isolate: false,
  runner: ${JSON.stringify(guardRunnerPath)},
  setupFiles: [${JSON.stringify(guardSetupPath)}${setupSource ? `, ${JSON.stringify(setupPath)}` : ''}],
} }`,
  )
  await Promise.all(files.map(file => writeFile(join(directory, file.name), file.source)))
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [vitestCliPath, 'run'], {
      cwd: directory,
      env: { ...process.env, CI: '', VITEST_MAX_WORKERS: '1' },
      timeout: 25_000,
    })
    return { exitCode: 0, output: stripVTControlCharacters(`${stdout}\n${stderr}`) }
  } catch (err) {
    const failure = err as { code?: number; stdout?: string; stderr?: string }
    return {
      exitCode: failure.code ?? 1,
      output: stripVTControlCharacters(`${failure.stdout ?? ''}\n${failure.stderr ?? ''}`),
    }
  }
}

function scopeCall(operation: string, scope: string): string {
  return `observeSharedDbScope(${JSON.stringify(operation)}, ${scope})`
}

describe('Vitest shared database scope guard', () => {
  afterEach(async () => {
    await Promise.all(
      fixtureDirectories
        .splice(0)
        .map(directory => rm(directory, { force: true, recursive: true })),
    )
  })

  it('fails a caught unscoped call after the test file finishes', async () => {
    const result = await runFixture([
      {
        name: 'caught.test.mts',
        source: `import { it } from 'vitest'
import { observeSharedDbScope } from ${JSON.stringify(observerPath)}
it('catches immediate error', () => {
  try { ${scopeCall('listCopyrightStaffQueue', `{ kind: 'global' }`)} } catch {}
})`,
      },
    ])
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain(
      '[vitest-shared-db-scope] listCopyrightStaffQueue on copyright_notices',
    )
  })

  it('fails an unscoped afterAll call', async () => {
    const result = await runFixture([
      {
        name: 'after-all.test.mts',
        source: `import { afterAll, it } from 'vitest'
import { observeSharedDbScope } from ${JSON.stringify(observerPath)}
afterAll(() => { try { ${scopeCall('rearmFailedActivityPubInboxDeliveries', `{ kind: 'global' }`)} } catch {} })
it('runs', () => {})`,
      },
    ])
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain(
      'rearmFailedActivityPubInboxDeliveries on activitypub_inbox_delivery_work_items',
    )
  })

  it('retains violations across resetModules', async () => {
    const result = await runFixture([
      {
        name: 'reset.test.mts',
        source: `import { it, vi } from 'vitest'
it('reimports the production module', async () => {
  vi.resetModules()
  const { observeSharedDbScope } = await import(${JSON.stringify(observerPath)})
  try { ${scopeCall('getRecoverableOAuthAuthorizationIds', `{ kind: 'global' }`)} } catch {}
})`,
      },
    ])
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain('getRecoverableOAuthAuthorizationIds on oauth_authorizations')
  })

  it('attributes a caught setup violation to only one isolate:false file', async () => {
    const result = await runFixture(
      [
        { name: 'first.test.mts', source: `import { it } from 'vitest'; it('runs', () => {})` },
        { name: 'second.test.mts', source: `import { it } from 'vitest'; it('runs', () => {})` },
      ],
      `import { closeSync, openSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { observeSharedDbScope } from ${JSON.stringify(observerPath)}
let firstSetup = false
try {
  closeSync(openSync(fileURLToPath(new URL('./setup-seen', import.meta.url)), 'wx'))
  firstSetup = true
} catch (error) {
  if ((error as { code?: string }).code !== 'EEXIST') throw error
}
if (firstSetup) {
  try { ${scopeCall('listAvailableNotificationPushIntents', `{ kind: 'global' }`)} } catch {}
}`,
    )
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain(
      'listAvailableNotificationPushIntents on notification_push_intents',
    )
    expect(result.output).toMatch(/Test Files\s+1 failed \| 1 passed \(2\)/)
  })

  it('does not transfer a collected failure to another isolate:false file', async () => {
    const result = await runFixture([
      {
        name: 'first-collection-error.test.mts',
        source: `import { observeSharedDbScope } from ${JSON.stringify(observerPath)}
try { ${scopeCall('listCopyrightStaffQueue', `{ kind: 'global' }`)} } catch {}
throw new Error('intentional collection failure')`,
      },
      {
        name: 'second-clean.test.mts',
        source: `import { it } from 'vitest'; it('runs', () => {})`,
      },
    ])
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain('intentional collection failure')
    expect(result.output).toContain('listCopyrightStaffQueue on copyright_notices')
    expect(result.output).toMatch(/Test Files\s+1 failed \| 1 passed \(2\)/)
  })

  it('allows scoped calls without a guard failure', async () => {
    const result = await runFixture([
      {
        name: 'scoped.test.mts',
        source: `import { it } from 'vitest'
import { observeSharedDbScope } from ${JSON.stringify(observerPath)}
it('uses owned bounds', () => {
  ${scopeCall('listCopyrightStaffQueue', `{ kind: 'cursor', id: 'owned-id' }`)}
  ${scopeCall('getRecoverableOAuthAuthorizationIds', `{ kind: 'ids', ids: ['owned-id'] }`)}
  ${scopeCall('searchCopyrightStaffEmailIntakes', `{ kind: 'ids', ids: ['owned-id'] }`)}
  ${scopeCall('listAvailableNotificationPushIntents', `{ kind: 'ids', ids: ['owned-id'] }`)}
  ${scopeCall('cleanupRetainedIdentityRoots', `{ kind: 'ids', ids: ['owned-id'] }`)}
  ${scopeCall('cleanupRetainedRelationIdentities', `{ kind: 'ids', ids: ['owned-id', 'owned-relation-id'] }`)}
})`,
      },
    ])
    expect(result.exitCode).toBe(0)
    expect(result.output).not.toContain('[vitest-shared-db-scope]')
  })

  it.each([
    ['searchCopyrightStaffEmailIntakes', 'copyright_notice_email_intakes', `{ kind: 'global' }`],
    [
      'searchCopyrightStaffEmailIntakes',
      'copyright_notice_email_intakes',
      `{ kind: 'ids', ids: [] }`,
    ],
    [
      'searchCopyrightStaffEmailIntakes',
      'copyright_notice_email_intakes',
      `{ kind: 'cursor', id: 'unrelated-id' }`,
    ],
    ['listAvailableNotificationPushIntents', 'notification_push_intents', `{ kind: 'global' }`],
    [
      'listAvailableNotificationPushIntents',
      'notification_push_intents',
      `{ kind: 'ids', ids: [] }`,
    ],
    [
      'listAvailableNotificationPushIntents',
      'notification_push_intents',
      `{ kind: 'cursor', id: 'unrelated-id' }`,
    ],
    ['cleanupRetainedIdentityRoots', 'retained_identity_cleanup_cursors', `{ kind: 'global' }`],
    [
      'cleanupRetainedIdentityRoots',
      'retained_identity_cleanup_cursors',
      `{ kind: 'ids', ids: [] }`,
    ],
    [
      'cleanupRetainedRelationIdentities',
      'retained_relation_identity_cleanup_cursors',
      `{ kind: 'global' }`,
    ],
    [
      'cleanupRetainedRelationIdentities',
      'retained_relation_identity_cleanup_cursors',
      `{ kind: 'ids', ids: [] }`,
    ],
  ] as const)('rejects %s calls with %s scope', async (operation, table, scope) => {
    const result = await runFixture([
      {
        name: 'cursor-only.test.mts',
        source: `import { it } from 'vitest'
import { observeSharedDbScope } from ${JSON.stringify(observerPath)}
it('catches an unowned call', () => {
  try { ${scopeCall(operation, scope)} } catch {}
})`,
      },
    ])
    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain(`[vitest-shared-db-scope] ${operation} on ${table}`)
  })
})
