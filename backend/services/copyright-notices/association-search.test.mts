import { createTestUser } from '@voucha/test-helpers'
import {
  createCopyrightNoticeForManualAssociation,
  markTestCopyrightNoticeErasedAndCommit,
  searchTestCopyrightAssociationsInTimeZone,
} from '@voucha/test-helpers/copyright-email-manual-association'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { randomUUID } from 'node:crypto'
import { encodeScopedUuidCursor } from '@modules/pagination'
import { createTestUuidWindow } from '@voucha/test-helpers/uuid-window'
import { describe, expect, it, onTestFinished } from 'vitest'
import { searchCopyrightNoticeAssociationTargets } from './association-search.mts'
import { copyrightSweepConfig } from './work-limits.mts'

describe('copyright notice association search', () => {
  it('finds an eligible notice by its work without exposing erased or UK cases', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const workDescription = `searched-work-${randomUUID()}`
    const window = createTestUuidWindow()
    const after = encodeScopedUuidCursor(
      window.thirdId,
      `copyright-notice-association:${workDescription.toLowerCase()}`,
    )
    const noticeId = await createCopyrightNoticeForManualAssociation(
      false,
      'us_dmca',
      workDescription,
      window.firstId,
    )
    const page = await searchCopyrightNoticeAssociationTargets(moderator, workDescription, after)
    expect(page.copyright_notices).toContainEqual(expect.objectContaining({ id: noticeId }))
    await markTestCopyrightNoticeErasedAndCommit(noticeId)
    expect(
      (await searchCopyrightNoticeAssociationTargets(moderator, workDescription, after))
        .copyright_notices,
    ).toEqual([])
  })

  it('continues past an empty candidate page without restarting the search', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    onTestFinished(
      overrideDynamicConfigFieldsForTest(copyrightSweepConfig, {
        association_search_candidate_rows: 1,
      }),
    )
    const workDescription = `searched-work-${randomUUID()}`
    const window = createTestUuidWindow()
    const matchingId = await createCopyrightNoticeForManualAssociation(
      false,
      'us_dmca',
      workDescription,
      window.firstId,
    )
    await createCopyrightNoticeForManualAssociation(
      false,
      'us_dmca',
      `other-work-${randomUUID()}`,
      window.secondId,
    )
    const after = encodeScopedUuidCursor(
      window.thirdId,
      `copyright-notice-association:${workDescription.toLowerCase()}`,
    )
    const first = await searchCopyrightNoticeAssociationTargets(moderator, workDescription, after)
    expect(first.copyright_notices).toEqual([])
    expect(first.page_info.has_next_page).toBe(true)
    const second = await searchCopyrightNoticeAssociationTargets(
      moderator,
      workDescription,
      first.page_info.end_cursor!,
    )
    expect(second.copyright_notices).toContainEqual(expect.objectContaining({ id: matchingId }))
  })
})

describe('copyright association received-date search', () => {
  it.each(['America/Los_Angeles', 'Asia/Tokyo'] as const)(
    'matches the UTC calendar day under a %s session',
    async timeZone => {
      const moderator = await createTestUser({ extraRoles: ['moderator'] })
      const window = createTestUuidWindow()
      const query = '2026-07-01'
      const first = await createCopyrightNoticeForManualAssociation(
        false,
        'us_dmca',
        `work-${randomUUID()}`,
        window.firstId,
        null,
        new Date('2026-07-01T00:30:00.000Z'),
      )
      const second = await createCopyrightNoticeForManualAssociation(
        false,
        'us_dmca',
        `work-${randomUUID()}`,
        window.secondId,
        null,
        new Date('2026-07-01T23:30:00.000Z'),
      )
      const after = encodeScopedUuidCursor(window.thirdId, `copyright-notice-association:${query}`)
      const page = await searchTestCopyrightAssociationsInTimeZone(
        moderator,
        query,
        after,
        timeZone,
      )
      expect(page.copyright_notices.map(notice => notice.id)).toEqual(
        expect.arrayContaining([first, second]),
      )
    },
  )
})
