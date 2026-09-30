import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers'
import { confirmTestRepeatInfringerNotice } from '@voucha/test-helpers/services/copyright-notices/repeat-infringer'
import { getPrivateUserByAny } from '@services/users/get'
import type { PrivateUser } from '@services/users/types'
import {
  getCopyrightRepeatInfringerAccount,
  recordCopyrightRepeatInfringerDisposition,
} from './index.mts'

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

    const account = await getCopyrightRepeatInfringerAccount(poster.id)
    expect(
      account.incidents
        .filter(incident => incident.operative)
        .map(incident => incident.copyright_notice_id)
        .sort(),
    ).toEqual([firstNoticeId, secondNoticeId].sort())
    expect(account.open_review_id).toEqual(expect.any(String))
    await expect(getPrivateUserByAny(poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: null }),
    )

    const operative = account.incidents.find(
      incident => incident.copyright_notice_id === firstNoticeId,
    )
    if (!operative) throw new Error('first incident disappeared')
    await recordCopyrightRepeatInfringerDisposition({
      currentUser: moderator,
      incidentId: operative.id,
      disposition: 'duplicate',
      rationale: 'This notice duplicates an earlier confirmed case.',
      recordedAt: new Date('2026-07-03T12:00:00.000Z'),
    })
    const afterDisposition = await getCopyrightRepeatInfringerAccount(poster.id)
    expect(
      afterDisposition.incidents.find(incident => incident.id === operative.id)?.operative,
    ).toBe(false)
    await expect(getPrivateUserByAny(poster.id)).resolves.toEqual(
      expect.objectContaining({ suspended_at: null }),
    )
  })
})
