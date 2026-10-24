import {
  readTestRepeatInfringerIncidents,
  readTestRepeatInfringerOpenReviewIds,
} from '@voucha/test-helpers/copyright-repeat-infringer'
import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers'
import { confirmTestRepeatInfringerNotice } from '@voucha/test-helpers/services/copyright-notices/repeat-infringer'
import { getPrivateUserByAny } from '@services/users/get'
import type { PrivateUser } from '@services/users/types'
import { recordCopyrightRepeatInfringerDisposition } from './repeat-infringer-incidents.mts'

describe('copyright repeat-infringer incidents', () => {
  it('opens one review at the second confirmed notice and does not suspend the account', async () => {
    const [poster, moderatorRecord] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as PrivateUser
    const firstNoticeId = await confirmTestRepeatInfringerNotice(
      poster.id,
      moderator,
      'repeat infringer',
    )
    const secondNoticeId = await confirmTestRepeatInfringerNotice(
      poster.id,
      moderator,
      'repeat infringer',
    )

    const account = await readTestRepeatInfringerIncidents(poster.id)
    expect(
      account
        .filter(incident => incident.is_operative)
        .map(incident => incident.copyright_notice_id)
        .toSorted(),
    ).toEqual([firstNoticeId, secondNoticeId].toSorted())
    expect(await readTestRepeatInfringerOpenReviewIds(poster.id)).toEqual([expect.any(String)])
    await expect(getPrivateUserByAny(poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: null }),
    )

    const is_operative = account.find(incident => incident.copyright_notice_id === firstNoticeId)
    if (!is_operative) throw new Error('first incident disappeared')
    await recordCopyrightRepeatInfringerDisposition({
      currentUser: moderator,
      incidentId: is_operative.id,
      disposition: 'duplicate',
      rationale: 'This notice duplicates an earlier confirmed case.',
      recordedAt: new Date('2026-07-03T12:00:00.000Z'),
    })
    const afterDisposition = await readTestRepeatInfringerIncidents(poster.id)
    expect(afterDisposition.find(incident => incident.id === is_operative.id)?.is_operative).toBe(
      false,
    )
    await expect(getPrivateUserByAny(poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: null }),
    )
  })
})
