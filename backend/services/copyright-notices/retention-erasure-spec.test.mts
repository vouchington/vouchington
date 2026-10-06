import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  attemptCopyrightRetentionSnapshotChange,
  attemptCopyrightRetentionStatement,
  permitsCopyrightRetentionChange,
  readCopyrightRetentionAllowlist,
  type CopyrightRetentionGuardStatement,
} from '@voucha/test-helpers/data-stores/psql/copyright-retention-guard'
import {
  readCopyrightRetentionColumns,
  readCopyrightSensitiveColumns,
} from '@voucha/test-helpers/data-stores/psql/copyright-retention'
import { enableAutomaticProvisionalWithholdingForTest } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { createRetentionEmailCase } from '@voucha/test-helpers/services/copyright-notices/retention-email-case'
import { createRetentionFormCase } from '@voucha/test-helpers/services/copyright-notices/retention-form-case'
import { addTestCopyrightSubmissionGuidanceForRetentionCase } from '@voucha/test-helpers/copyright-submission-guidance-retention'
import { createRetentionAdministratorLiftCase } from '@voucha/test-helpers/copyright-retention-administrator-lift'
import { COPYRIGHT_RETENTION_ERASURE } from './retention-erasure-spec.mts'

/** SQLSTATE check_violation, which every legal-record guard raises. */
const GUARD_REJECTION = { rejectedWith: '23514' }

/**
 * A table whose erasable columns the legal-record guards already let change in any transaction, so
 * the permit adds nothing there: one whose only erasable columns are user ids (an account deletion
 * clears those), and the delivery intents, whose failure text is operational state that a retry
 * rewrites and whose body is only ever set on intake-linked intents, which a notice never reaches.
 */
const changesWithoutPermit = (spec: (typeof COPYRIGHT_RETENTION_ERASURE)[number]) =>
  spec.table === 'copyright_notice_delivery_work_items' ||
  Object.values(spec.columns).every(kind => kind === 'null')

/**
 * Tables the sweep deliberately keeps whole: EU and UK cases (the EU-only tables and the shared
 * territorial tables) are not swept, and a repeat-infringer decision is the 17 USC 512(i) record.
 */
const KEPT_TABLES = [/^copyright_(eu|uk|territorial)_/, /^copyright_repeat_infringer_/]

type Target = { spec: (typeof COPYRIGHT_RETENTION_ERASURE)[number]; noticeId: string }

/** For each covered table, a notice with a row holding something the overwrite would change. */
async function createTargets(): Promise<Target[]> {
  const cases = await Promise.all([
    createRetentionEmailCase(),
    createRetentionFormCase(),
    createRetentionAdministratorLiftCase(),
  ])
  await addTestCopyrightSubmissionGuidanceForRetentionCase(cases[1]!.noticeId)
  const rows = await Promise.all(cases.map(entry => readCopyrightRetentionColumns(entry.noticeId)))
  const targets: Target[] = []
  const uncovered: string[] = []
  for (const spec of COPYRIGHT_RETENTION_ERASURE) {
    const owner = rows.findIndex(entry =>
      (entry[spec.table] ?? []).some(row => Object.keys(spec.columns).some(c => row[c] !== null)),
    )
    if (owner < 0) uncovered.push(spec.table)
    else targets.push({ spec, noticeId: cases[owner]!.noticeId })
  }
  if (uncovered.length > 0) {
    throw new Error(`no fixture row with erasable data in ${uncovered.join(', ')}`)
  }
  return targets
}

describe('copyright retention erasure spec and legal-record guards', () => {
  let targets: Target[] = []
  let restoreWithholding: (() => void) | undefined

  // Every statement below is rolled back, so one set of fixtures serves the whole file.
  beforeAll(async () => {
    restoreWithholding = await enableAutomaticProvisionalWithholdingForTest()
    targets = await createTargets()
  }, 240_000)

  afterAll(() => restoreWithholding?.())

  async function attemptAll(statement: CopyrightRetentionGuardStatement, permit: boolean) {
    const outcomes: [string, Awaited<ReturnType<typeof attemptCopyrightRetentionStatement>>][] = []
    for (const { spec, noticeId } of targets) {
      outcomes.push([
        spec.table,
        await attemptCopyrightRetentionStatement({ spec, noticeId, statement, permit }),
      ])
    }
    return outcomes
  }

  it('lists in the database exactly the tables and columns the sweep overwrites', async () => {
    const overwritten = Object.fromEntries(
      COPYRIGHT_RETENTION_ERASURE.map(spec => [spec.table, Object.keys(spec.columns).toSorted()]),
    )

    await expect(readCopyrightRetentionAllowlist()).resolves.toEqual(overwritten)
  })

  it('decides every column that can hold personal data, so a new one cannot be forgotten', async () => {
    const sensitive = await readCopyrightSensitiveColumns()

    const undecided = Object.entries(sensitive).flatMap(([table, columns]) =>
      KEPT_TABLES.some(pattern => pattern.test(table))
        ? []
        : columns
            .filter(column => !(column in erasedColumns(table)))
            .map(column => `${table}.${column}`),
    )

    expect(undecided).toEqual([])
  })

  it('permits a change only inside the erasable columns of a listed table, and only when asked', async () => {
    for (const spec of COPYRIGHT_RETENTION_ERASURE) {
      const columns = Object.keys(spec.columns)
      const decisions = await Promise.all([
        permitsCopyrightRetentionChange({ table: spec.table, changed: columns, permit: true }),
        permitsCopyrightRetentionChange({ table: spec.table, changed: columns, permit: false }),
        permitsCopyrightRetentionChange({
          table: spec.table,
          changed: [...columns, 'untouched'],
          permit: true,
        }),
        permitsCopyrightRetentionChange({ table: spec.table, changed: ['id'], permit: true }),
      ])
      expect([spec.table, decisions]).toEqual([spec.table, [true, false, false, false]])
    }

    await expect(
      permitsCopyrightRetentionChange({
        table: 'copyright_notice_targets',
        changed: ['hosted_use_url'],
        permit: true,
      }),
    ).resolves.toBe(false)
  })

  it('rejects the overwrite in every covered table unless the transaction asks for erasure', async () => {
    const outcomes = await attemptAll('overwrite', false)

    expect(outcomes.filter(([table]) => !changesWithoutPermit(specOf(table)))).toEqual(
      COPYRIGHT_RETENTION_ERASURE.filter(spec => !changesWithoutPermit(spec)).map(spec => [
        spec.table,
        GUARD_REJECTION,
      ]),
    )
  })

  it('accepts the overwrite in every covered table once the transaction asks for erasure', async () => {
    const outcomes = await attemptAll('overwrite', true)

    expect(
      outcomes.map(([table, outcome]) => [table, 'affected' in outcome && outcome.affected > 0]),
    ).toEqual(COPYRIGHT_RETENTION_ERASURE.map(spec => [spec.table, true]))
  })

  it('still rejects deleting a row when the transaction asks for erasure', async () => {
    await expect(attemptAll('delete', true)).resolves.toEqual(
      COPYRIGHT_RETENTION_ERASURE.map(spec => [spec.table, GUARD_REJECTION]),
    )
  })

  it('still rejects an erasure that also moves a notice snapshot', async () => {
    const noticeId = targets[0]!.noticeId

    await expect(attemptCopyrightRetentionSnapshotChange(noticeId)).resolves.toEqual(
      GUARD_REJECTION,
    )
  })
})

function specOf(table: string) {
  return COPYRIGHT_RETENTION_ERASURE.find(spec => spec.table === table)!
}

function erasedColumns(table: string): Record<string, unknown> {
  return COPYRIGHT_RETENTION_ERASURE.find(spec => spec.table === table)?.columns ?? {}
}
