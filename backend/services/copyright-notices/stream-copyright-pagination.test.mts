import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createSignedInCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { streamCopyrightExports, streamCopyrightFiledNotices } from './stream-copyright.mts'
import { streamCopyrightAppeals } from './stream-copyright-submissions.mts'
import { createCopyrightAppeal } from './submissions.mts'

describe('copyright export native owner pages', () => {
  useCopyrightIntakeEnvironment()

  it('exports every owned filing and appeal across one-row pages without foreign rows', async () => {
    const [claimant, poster] = await Promise.all([createTestUser(), createTestUser()])
    const first = await createSignedInCopyrightForm(1, { claimant, poster })
    const second = await createSignedInCopyrightForm(1, { claimant, poster })
    const foreign = await createSignedInCopyrightForm()
    const appeals = []
    for (const { intake } of [first, second]) {
      const aggregate = await getCopyrightNoticePrivateAggregate(intake.copyright_notice_id)
      const targetId = aggregate?.targets[0]?.id
      if (!targetId) throw new Error('Owned export case target is missing')
      const reason = `Owned export appeal ${crypto.randomUUID()}`
      const result = await createCopyrightAppeal(
        poster,
        intake.copyright_notice_id,
        crypto.randomUUID(),
        {
          reason,
          targetIds: [targetId],
        },
      )
      appeals.push({ id: result.submission.id, noticeId: intake.copyright_notice_id, reason })
    }

    const filed: Record<string, unknown>[] = []
    for await (const row of streamCopyrightFiledNotices(claimant.id, 1)) filed.push(row)
    expect(filed.map(row => row.notice_id)).toEqual(
      [first.intake.copyright_notice_id, second.intake.copyright_notice_id].toSorted(),
    )
    expect(filed).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ notice_id: foreign.intake.copyright_notice_id }),
      ]),
    )
    for (const row of filed)
      expect(row).toMatchObject({
        claimant_contact: 'claimant@example.test',
        electronic_signature: 'Claimant',
      })

    const exportedAppeals: Record<string, unknown>[] = []
    for await (const row of streamCopyrightAppeals(poster.id, 1)) exportedAppeals.push(row)
    expect(exportedAppeals.map(row => row.submission_id)).toEqual(
      appeals.map(row => row.id).toSorted(),
    )
    for (const appeal of appeals)
      expect(exportedAppeals).toContainEqual(
        expect.objectContaining({
          submission_id: appeal.id,
          notice_id: appeal.noticeId,
          reason: appeal.reason,
        }),
      )
    const claimantAppeals: Record<string, unknown>[] = []
    for await (const row of streamCopyrightAppeals(claimant.id, 1)) claimantAppeals.push(row)
    expect(claimantAppeals).toEqual([])
  })

  it('rejects invalid export page sizes before yielding private records', async () => {
    const user = await createTestUser()
    expect(() => streamCopyrightExports(user.id, 0)).toThrow('positive safe integer')
    await expect(streamCopyrightFiledNotices(user.id, 0).next()).rejects.toThrow(
      'positive safe integer',
    )
    await expect(streamCopyrightAppeals(user.id, 0).next()).rejects.toThrow('positive safe integer')
  })
})
