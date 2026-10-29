import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { confirmTestRepeatInfringerNotice } from '@voucha/test-helpers/services/copyright-notices/repeat-infringer'
import { readTestRepeatInfringerAccountState } from '@voucha/test-helpers/copyright-repeat-infringer'
import { unsuspendUser } from '@services/users/suspension'
import {
  listCopyrightRepeatInfringerAccountsForNotice,
  recordCopyrightRepeatInfringerReinstatement,
  recordCopyrightRepeatInfringerReviewOutcome,
} from './index.mts'

describe('copyright repeat-infringer termination persistence', () => {
  it('keeps an effective termination through a later warning until reinstatement', async () => {
    const [poster, moderator, administrator] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser({ administrator: true }),
    ])
    const firstNoticeId = await confirmTestRepeatInfringerNotice(poster.id, moderator)
    await confirmTestRepeatInfringerNotice(poster.id, moderator)
    const terminatedReviewId = (
      await listCopyrightRepeatInfringerAccountsForNotice(moderator, firstNoticeId)
    )[0]?.open_review_id
    if (!terminatedReviewId) throw new Error('termination review missing')
    const terminatedAt = new Date()
    await recordCopyrightRepeatInfringerReviewOutcome({
      currentUser: administrator,
      reviewId: terminatedReviewId,
      outcome: 'terminate',
      rationale: 'Two operative cases',
      recordedAt: terminatedAt,
    })
    const terminated = await readTestRepeatInfringerAccountState(poster.id)
    expect(terminated?.effective_termination_rationale_ciphertext).toBeTruthy()
    await confirmTestRepeatInfringerNotice(poster.id, moderator)
    const laterReviewId = (
      await listCopyrightRepeatInfringerAccountsForNotice(moderator, firstNoticeId)
    )[0]?.open_review_id
    if (!laterReviewId) throw new Error('later review missing')
    await recordCopyrightRepeatInfringerReviewOutcome({
      currentUser: moderator,
      reviewId: laterReviewId,
      outcome: 'warning',
      rationale: 'Later review did not change the termination',
      recordedAt: new Date(),
    })
    expect(await readTestRepeatInfringerAccountState(poster.id)).toMatchObject({
      current_outcome: 'warning',
      effective_termination_rationale_ciphertext:
        terminated?.effective_termination_rationale_ciphertext,
      is_termination_in_effect: true,
      effective_termination_review_identity_id: terminatedReviewId,
      effective_termination_decided_at: terminatedAt,
      effective_termination_decided_by_id: administrator.id,
    })
    await expect(unsuspendUser(administrator, poster.id)).rejects.toMatchObject({ status: 409 })
    await recordCopyrightRepeatInfringerReinstatement({
      currentUser: administrator,
      accountUserId: poster.id,
      rationale: 'Reinstated after review',
      recordedAt: new Date(),
    })
    expect(await readTestRepeatInfringerAccountState(poster.id)).toMatchObject({
      current_outcome: 'reinstatement',
      is_termination_in_effect: false,
      effective_termination_review_identity_id: null,
      effective_termination_decided_at: null,
      effective_termination_decided_by_id: null,
      effective_termination_rationale_ciphertext: null,
    })
  })
})
