import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import {
  deleteCopyrightNoticeKeepingIdentity,
  readCopyrightNoticeIdentityCounts,
  seedMediaDeliveryReplayNoticeCommitted as seedNotice,
} from '../../../test-helpers/media-delivery-replay-notice.mts'

describe('seedMediaDeliveryReplayNotice', () => {
  it('is repeatable on a dirty database and keeps retained-identity resurrection protection', async () => {
    const noticeId = v7()

    await seedNotice(noticeId)
    await seedNotice(noticeId)
    expect(await readCopyrightNoticeIdentityCounts(noticeId)).toEqual({ notices: 1, identities: 1 })

    await deleteCopyrightNoticeKeepingIdentity(noticeId)
    expect(await readCopyrightNoticeIdentityCounts(noticeId)).toEqual({ notices: 0, identities: 1 })
    await expect(seedNotice(noticeId)).rejects.toMatchObject({ code: '23505' })
    expect(await readCopyrightNoticeIdentityCounts(noticeId)).toEqual({ notices: 0, identities: 1 })
  })
})
