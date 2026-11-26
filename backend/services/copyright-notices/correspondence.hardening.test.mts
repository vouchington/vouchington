import { describe, expect, it } from 'vitest'
import { createSignedInCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { raceCopyrightCorrespondenceWriters } from '@voucha/test-helpers/copyright-correspondence-writer-race'
import { readTestCopyrightGuestEventClocks } from '@voucha/test-helpers/copyright-guest-filing-constraints'

describe('copyright correspondence concurrent writers', () => {
  it('commits both outbound writers and the decision message without a notice-lock upgrade deadlock', async () => {
    const { intake } = await createSignedInCopyrightForm()
    const noticeId = intake.copyright_notice_id
    const before = await readTestCopyrightGuestEventClocks(noticeId)
    const messages = await raceCopyrightCorrespondenceWriters(noticeId)
    expect(new Set(messages.map(message => message.id)).size).toBe(3)
    expect(messages.every(message => message.copyright_notice_id === noticeId)).toBe(true)
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    expect(aggregate?.correspondence).toEqual(
      expect.arrayContaining(
        messages.map(message =>
          expect.objectContaining({
            id: message.id,
            copyright_notice_id: noticeId,
            body_ciphertext: message.body_ciphertext,
          }),
        ),
      ),
    )
    const createdIds = aggregate?.lifecycleEvents
      .filter(event => event.change_type === 'outbound_correspondence_created')
      .map(event => event.copyright_notice_correspondence_id)
    expect(createdIds).toEqual(expect.arrayContaining([messages[0]!.id, messages[2]!.id]))
    const after = await readTestCopyrightGuestEventClocks(noticeId)
    expect(after.last_legal_activity_at).toBeGreaterThan(before.last_legal_activity_at)
    expect(after.last_lifecycle_activity_at).not.toBeNull()
    expect(after.last_lifecycle_activity_at!).toBeGreaterThan(
      before.last_lifecycle_activity_at ?? 0n,
    )
  })
})
