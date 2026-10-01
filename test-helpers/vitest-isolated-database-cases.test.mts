import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertIsolatedDatabaseCaseRan,
  formatIsolatedDatabaseCaseResult,
} from './vitest-isolated-database-case-result.mts'
import {
  getIsolatedDatabaseCase,
  getIsolatedDatabaseCaseMode,
  getIsolatedDatabaseChildCase,
  isolatedTestNamePattern,
  makeIsolatedDatabaseName,
} from './vitest-isolated-database-cases.mts'

const execFileAsync = promisify(execFile)
const vitestCli = join(
  dirname(fileURLToPath(import.meta.resolve('vitest/package.json'))),
  'vitest.mjs',
)
const reporterPath = fileURLToPath(
  new URL('./vitest-isolated-database-case-reporter.mts', import.meta.url),
)
const fixtureDirs: string[] = []
const databaseName = `voucha_scope_case_${'a'.repeat(24)}`
const databaseUrl = `postgres://postgres@localhost:5432/${databaseName}`
const childEnv = {
  VITEST_ISOLATED_DATABASE_CASE: 'activitypub-expiry',
  VITEST_ISOLATED_DATABASE_CHILD: databaseName,
  DATABASE_URL: databaseUrl,
  READ_DATABASE_URL: databaseUrl,
}

describe('isolated database case selection', () => {
  it('registers only exact isolated database tests', () => {
    expect(makeIsolatedDatabaseName('a'.repeat(24))).toBe(databaseName)
    expect(() => makeIsolatedDatabaseName('shared_database')).toThrow(
      'Invalid isolated database suffix',
    )
    expect(getIsolatedDatabaseCase('media-replay')).toEqual({
      file: 'backend/api/v1/copyright-notices/copyright-notices.replay.isolated.test.mts',
      fullName:
        'isolated global media replay route > replays failed media registry records only for review staff and writes one audit event',
    })
    expect(getIsolatedDatabaseCase('activitypub-expiry')).toEqual({
      file: 'backend/services/ap-inbox-activities/durable-delivery-storage.test.mts',
      fullName:
        'ActivityPub inbox durable storage bounds > deletes expired rows in deterministic lease-aware locked batches',
    })
    expect(getIsolatedDatabaseCase('copyright-staff-email-intakes')).toEqual({
      file: 'backend/services/copyright-notices/email-intakes-staff-queue.test.mts',
      fullName:
        'searchCopyrightStaffEmailIntakes > hides the queue from non-reviewers and lists unreviewed intakes, parsed or not, for staff',
    })
    for (const [caseId, title] of [
      [
        'copyright-email-queue-exact-limit',
        'ends on an exact-limit final page with no next cursor',
      ],
      ['copyright-email-queue-partial', 'ends on a partial final page'],
      ['copyright-email-queue-walk', 'walks every owned intake one page at a time without repeats'],
      [
        'copyright-email-queue-tie',
        'uses the UUID tie-breaker when two intakes share a received timestamp',
      ],
    ] as const) {
      expect(getIsolatedDatabaseCase(caseId)).toEqual({
        file: 'backend/api/v1/copyright-notices/email-intake-queue-pagination.test.mts',
        fullName: `copyright email intake queue pagination > ${title}`,
      })
    }
    expect(getIsolatedDatabaseCase('copyright-dev-seed')).toEqual({
      file: 'backend/scripts/seed/copyright.test.mts',
      fullName:
        'seedCopyright > fills both staff queues with every review state and adds nothing when run again',
    })
    expect(getIsolatedDatabaseCase('copyright-cache-policy')).toEqual({
      file: 'backend/api/v1/copyright-notices/copyright-cache.test.mts',
      fullName:
        'copyright API cache policy > marks member, staff, and raw-email responses private and no-store',
    })
    expect(() => getIsolatedDatabaseCase('other')).toThrow('Unknown isolated database case')
  })

  it('anchors the selected test name instead of matching a prefix or sibling', () => {
    const { fullName } = getIsolatedDatabaseCase('activitypub-expiry')
    const pattern = new RegExp(isolatedTestNamePattern('activitypub-expiry'))
    expect(pattern.test(fullName)).toBe(true)
    expect(pattern.test(`${fullName} extra`)).toBe(false)
    expect(pattern.test(`prefix ${fullName}`)).toBe(false)
  })

  it('distinguishes a parent from the exact registered disposable child', () => {
    expect(getIsolatedDatabaseCaseMode('activitypub-expiry', {})).toBe('parent')
    expect(getIsolatedDatabaseCaseMode('activitypub-expiry', childEnv)).toBe('child')
    expect(getIsolatedDatabaseChildCase(childEnv)).toEqual(
      getIsolatedDatabaseCase('activitypub-expiry'),
    )
  })

  it.each([
    {
      override: { VITEST_ISOLATED_DATABASE_CHILD: undefined },
      message: 'Invalid isolated database child identity',
    },
    {
      override: { VITEST_ISOLATED_DATABASE_CASE: undefined },
      message: 'Invalid isolated database child identity',
    },
    {
      override: { VITEST_ISOLATED_DATABASE_CASE: 'media-replay' },
      message: 'Invalid isolated database child identity',
    },
    {
      override: { VITEST_ISOLATED_DATABASE_CHILD: 'shared_database' },
      message: 'Invalid isolated database child identity',
    },
    {
      override: { DATABASE_URL: 'postgres://postgres@localhost:5432/shared_database' },
      message: 'requires its exact disposable database',
    },
    {
      override: { READ_DATABASE_URL: 'postgres://postgres@localhost:5432/shared_database' },
      message: 'requires its exact disposable database',
    },
    {
      override: { DATABASE_URL: `${databaseUrl}?dbname=shared_database` },
      message: 'requires its exact disposable database',
    },
    {
      override: { DATABASE_URL: `postgres://postgres@remote.example:5432/${databaseName}` },
      message: 'requires its exact disposable database',
    },
  ])('rejects a malformed or mismatched child identity %#', ({ override, message }) => {
    expect(() =>
      getIsolatedDatabaseCaseMode('activitypub-expiry', { ...childEnv, ...override }),
    ).toThrow(message)
  })

  it('rejects a child config without both identity markers', () => {
    expect(() => getIsolatedDatabaseChildCase({})).toThrow('Missing isolated database child case')
    expect(() =>
      getIsolatedDatabaseChildCase({ ...childEnv, VITEST_ISOLATED_DATABASE_CASE: 'other' }),
    ).toThrow('Unknown isolated database case')
  })
})

/** Runs a real Vitest over a file shaped like the registered copyright-cache-policy case. */
async function runCopyrightCachePolicyFixture(testNamePattern: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-isolated-case-'))
  fixtureDirs.push(dir)
  await writeFile(
    join(dir, 'vitest.config.mts'),
    `import { IsolatedDatabaseCaseReporter } from ${JSON.stringify(reporterPath)}
export default { test: { reporters: [new IsolatedDatabaseCaseReporter()] } }
`,
  )
  await writeFile(
    join(dir, 'fixture.test.mts'),
    `import { describe, it } from 'vitest'
describe('copyright API cache policy', () => {
  it('marks member, staff, and raw-email responses private and no-store', () => {})
  it('is a sibling the pattern leaves unselected', () => {})
})
`,
  )
  const { stdout } = await execFileAsync(
    process.execPath,
    [vitestCli, 'run', '--testNamePattern', testNamePattern],
    { cwd: dir, env: { ...process.env, CI: '' }, timeout: 60_000 },
  )
  return stdout
}

describe('isolated database case execution', () => {
  const caseId = 'copyright-cache-policy'
  const { fullName } = getIsolatedDatabaseCase(caseId)

  afterEach(async () => {
    await Promise.all(fixtureDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('selects the registered test by the full name Vitest reports', async () => {
    const output = await runCopyrightCachePolicyFixture(isolatedTestNamePattern(caseId))

    expect(() => assertIsolatedDatabaseCaseRan(caseId, output)).not.toThrow()
  }, 90_000)

  it('fails a child whose pattern skipped the registered test', async () => {
    const spaceJoinedPattern = isolatedTestNamePattern(caseId).replace(' > ', ' ')
    const output = await runCopyrightCachePolicyFixture(spaceJoinedPattern)

    expect(() => assertIsolatedDatabaseCaseRan(caseId, output)).toThrow(
      `must pass exactly one test named "${fullName}" but 0 passed, 0 failed, 2 collected`,
    )
  }, 90_000)

  it.each([
    ['collected no tests', []],
    ['skipped the registered test', [{ fullName, state: 'skipped' }]],
    ['passed only a different test', [{ fullName: 'other suite > other test', state: 'passed' }]],
    [
      'passed the registered test and failed a sibling',
      [
        { fullName, state: 'passed' },
        { fullName: 'copyright API cache policy > sibling', state: 'failed' },
      ],
    ],
    [
      'passed two tests with the registered name',
      [
        { fullName, state: 'passed' },
        { fullName, state: 'passed' },
      ],
    ],
  ])('fails a child that %s', (_description, tests) => {
    const output = `noise\n${formatIsolatedDatabaseCaseResult(tests)}more noise\n`

    expect(() => assertIsolatedDatabaseCaseRan(caseId, output)).toThrow(
      `must pass exactly one test named "${fullName}"`,
    )
  })

  it('fails a child that reported no results', () => {
    expect(() => assertIsolatedDatabaseCaseRan(caseId, 'Tests  1 passed (1)\n')).toThrow(
      'child did not report its test results',
    )
  })

  it('accepts exactly one passing registered test beside skipped siblings', () => {
    const output = formatIsolatedDatabaseCaseResult([
      { fullName: 'copyright API cache policy > sibling', state: 'skipped' },
      { fullName, state: 'passed' },
    ])

    expect(() => assertIsolatedDatabaseCaseRan(caseId, output)).not.toThrow()
  })
})
