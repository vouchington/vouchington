import { describe, expect, it } from 'vitest'
import { beginTransaction } from '@voucha/test-helpers'
import { readCopyrightNoticeTargetId } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { createSignedInCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { decryptCopyrightClaimantEmail, getCopyrightClaimantEmail } from './claimant-email.mts'
import { selectCopyrightDeliveryInputs } from './delivery-inputs.mts'
import { selectCopyrightStatementFactsBatch } from './statement-of-reasons-facts.mts'

describe('copyright delivery inputs', () => {
  useCopyrightIntakeEnvironment()

  async function seedNotice() {
    const noticeId = (await createSignedInCopyrightForm(1)).intake.copyright_notice_id
    return { noticeId, targetId: await readCopyrightNoticeTargetId(noticeId) }
  }

  it('reads the same facts, recipients and claimant address as the separate reads', async () => {
    const { noticeId, targetId } = await seedNotice()
    const unknownTargetId = crypto.randomUUID()
    const authorities = [{ targetId }, { targetId: unknownTargetId }]
    await using transaction = await beginTransaction()
    const inputs = await selectCopyrightDeliveryInputs(noticeId, transaction, {
      authorities,
      targetIds: [targetId],
      purposes: ['notify', 'inform'],
    })
    expect(inputs.facts).toEqual(
      await selectCopyrightStatementFactsBatch(noticeId, transaction, authorities),
    )
    expect(inputs.facts[1]!.targetUrls).toEqual([])
    expect(inputs.parties.length).toBeGreaterThan(0)
    expect(inputs.parties.every(party => party.target_id === targetId)).toBe(true)
    expect(decryptCopyrightClaimantEmail(inputs.claimantEmail)).toBe(
      await getCopyrightClaimantEmail(noticeId, transaction),
    )
  })

  it('returns no recipients for a target that has no placement parties', async () => {
    const { noticeId } = await seedNotice()
    await using transaction = await beginTransaction()
    const inputs = await selectCopyrightDeliveryInputs(noticeId, transaction, {
      authorities: [{ targetId: crypto.randomUUID() }],
      targetIds: [crypto.randomUUID()],
      purposes: ['notify', 'inform'],
    })
    expect(inputs.parties).toEqual([])
    expect(inputs.facts).toHaveLength(1)
  })

  it('reads the receipt address the filing recorded and decrypts it only on request', async () => {
    const { noticeId, targetId } = await seedNotice()
    await using transaction = await beginTransaction()
    const inputs = await selectCopyrightDeliveryInputs(noticeId, transaction, {
      authorities: [{ targetId }],
      targetIds: [targetId],
      purposes: ['notify'],
    })
    expect(inputs.claimantEmail?.email_ciphertext).toEqual(expect.any(String))
    expect(decryptCopyrightClaimantEmail(inputs.claimantEmail)).toBe('claimant@example.test')
    expect(decryptCopyrightClaimantEmail(null)).toBeNull()
  })

  it('rejects an unknown notice', async () => {
    await using transaction = await beginTransaction()
    await expect(
      selectCopyrightDeliveryInputs(crypto.randomUUID(), transaction, {
        authorities: [{}],
        targetIds: [],
        purposes: ['notify'],
      }),
    ).rejects.toMatchObject({ status: 404 })
  })
})
