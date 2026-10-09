import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createSignedInCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { createTestCopyrightStaff } from '@voucha/test-helpers/services/copyright-notices/guest-capability'
import { readTestCopyrightStaffCase } from '@voucha/test-helpers/services/copyright-notices/staff-case'
import { appendCopyrightGuestFiling, issueCopyrightGuestCapability } from './index.mts'
import { getPendingCopyrightStaffCases } from './read-models-staff-case.mts'
import { listCopyrightStaffQueue } from './read-models-staff.mts'

async function createCasesWithDistinctChildren() {
  const claimant = await createTestUser()
  // Three notices with one, two and three targets; the first and last share a claimant.
  const [one, two, three] = [
    await createSignedInCopyrightForm(1, { claimant }),
    await createSignedInCopyrightForm(2),
    await createSignedInCopyrightForm(3, { claimant }),
  ]
  const ids = [one, two, three].map(item => item.intake.copyright_notice_id)
  // Only the second notice has a court or CCB filing, so a leak across notices would show.
  const staff = await createTestCopyrightStaff()
  const now = new Date()
  const capability = await issueCopyrightGuestCapability({
    currentUser: staff,
    noticeId: ids[1]!,
    expiresAt: new Date(now.getTime() + 60_000),
  })
  const filing = await appendCopyrightGuestFiling({
    noticeId: ids[1]!,
    token: capability.token,
    now,
    kind: 'court_or_ccb_hold',
    statement: 'I filed suit concerning the material identified in this notice.',
  })
  return { ids, staff, filing }
}

describe('batched copyright staff case reads', () => {
  it('gives each listed notice only its own children and omits an unknown notice', async () => {
    const { ids, filing } = await createCasesWithDistinctChildren()
    const unknownId = randomUUID()

    await using transaction = await beginTransaction()
    const cases = await getPendingCopyrightStaffCases(
      [ids[2]!, unknownId, ids[0]!, ids[1]!],
      transaction,
    )
    await transaction.commit()

    expect([...cases.keys()].toSorted()).toEqual([...ids].toSorted())
    expect(cases.has(unknownId)).toBe(false)
    expect(ids.map(id => cases.get(id)!.targets.length)).toEqual([1, 2, 3])
    for (const id of ids) {
      expect(cases.get(id)!.id).toBe(id)
      expect(cases.get(id)!.targets.every(target => target.id.length > 0)).toBe(true)
    }
    expect(cases.get(ids[0]!)!.legal_holds).toEqual([])
    expect(cases.get(ids[2]!)!.legal_holds).toEqual([])
    expect(cases.get(ids[1]!)!.legal_holds).toEqual([
      expect.objectContaining({ submission_id: filing.id, assessment: null }),
    ])
    // Every batched case equals the same case loaded alone.
    for (const id of ids) expect(cases.get(id)).toEqual(await readTestCopyrightStaffCase(id))
    const targetIds = ids.flatMap(id => cases.get(id)!.targets.map(target => target.id))
    expect(new Set(targetIds).size).toBe(6)
  })

  it('returns no cases without querying when the list is empty', async () => {
    await using transaction = await beginTransaction()
    await expect(getPendingCopyrightStaffCases([], transaction)).resolves.toEqual(new Map())
    await transaction.commit()
  })

  it('pages the queue with each item carrying its own case and queue fields', async () => {
    const { ids, staff } = await createCasesWithDistinctChildren()

    const first = await listCopyrightStaffQueue(staff, { limit: 2, noticeIds: ids })
    expect(first.cases).toHaveLength(2)
    expect(first.hasNextPage).toBe(true)
    expect(first.endCursor).toEqual(first.cases[1]!.cursor)
    const second = await listCopyrightStaffQueue(staff, {
      limit: 2,
      noticeIds: ids,
      after: first.endCursor!,
    })
    expect(second.cases).toHaveLength(1)
    expect(second.hasNextPage).toBe(false)
    expect(second.endCursor).toBeNull()

    const paged = [...first.cases, ...second.cases]
    expect(paged.map(item => item.id).toSorted()).toEqual([...ids].toSorted())
    for (const item of paged) {
      const { cursor, reasons, waiting_since, next_deadline, ...staffCase } = item
      expect(cursor.id).toBe(item.id)
      expect(reasons).toEqual(expect.any(Array))
      expect(waiting_since).toBeInstanceOf(Date)
      expect(next_deadline === null || next_deadline.escalation_at instanceof Date).toBe(true)
      expect(staffCase).toEqual(await readTestCopyrightStaffCase(item.id))
    }
  })
})
