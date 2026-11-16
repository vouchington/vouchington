import { describe, expect, it } from 'vitest'
import { beginTransaction, createTestUserDirect } from '@voucha/test-helpers'
import { beforePostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import {
  addHeldCopyrightRationaleParty,
  prepareCopyrightRationalePreservationPage,
  readCopyrightRationalePreservationPage,
} from '@voucha/test-helpers/copyright-rationale-preservation'
import { testRationaleRetentionEligible } from '@voucha/test-helpers/security-retention'
import { cleanupSecuritySourcePageInTransaction } from '../data-retention/security-record-page.mts'
import { sourcePlan } from '../data-retention/security-record-plans.mts'

describe('copyright rationale retention preservation', () => {
  it('rechecks a newly held party before deleting the selected rationale page', async () => {
    const [actor, party] = await Promise.all([createTestUserDirect(), createTestUserDirect()])
    let protectedId: string | undefined
    let noticeId: string | undefined
    let committedParty = false
    const restore = beforePostgresTransactionQueryForTest(
      'deleteSecurityRetentionPage:copyright_rationales_attempts',
      values => values.some(value => Array.isArray(value) && value.includes(protectedId)),
      async () => {
        if (!noticeId) throw new Error('Owned case is missing')
        await addHeldCopyrightRationaleParty(noticeId, party.id)
        committedParty = true
      },
    )
    try {
      await using query = await beginTransaction()
      const [protectedRow, eligibleRow, excludedRow] =
        await prepareCopyrightRationalePreservationPage(query, actor.id)
      protectedId = protectedRow.id
      noticeId = protectedRow.noticeId
      const ids = [protectedRow.id, eligibleRow.id, excludedRow.id]
      const before = await readCopyrightRationalePreservationPage(query, ids)
      const now = new Date('2026-11-16T12:00:00.000Z')
      const cutoff = sourcePlan('copyright_rationales_attempts', now).cutoffAt
      expect(await testRationaleRetentionEligible(query, protectedRow.id, cutoff)).toBe(true)
      expect(await testRationaleRetentionEligible(query, excludedRow.id, cutoff)).toBe(true)
      expect(
        await cleanupSecuritySourcePageInTransaction(
          query,
          'copyright_rationales_attempts',
          2,
          now,
        ),
      ).toEqual({ deleted: 1, hasMore: true })
      expect(committedParty).toBe(true)
      expect(await testRationaleRetentionEligible(query, protectedRow.id, cutoff)).toBe(false)
      expect(await testRationaleRetentionEligible(query, excludedRow.id, cutoff)).toBe(true)
      const after = await readCopyrightRationalePreservationPage(query, ids)
      expect(after).toEqual(before.filter(row => row.id !== eligibleRow.id))
    } finally {
      restore()
    }
  })
})
