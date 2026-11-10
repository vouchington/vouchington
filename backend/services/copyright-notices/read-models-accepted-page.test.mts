import { describe, expect, it } from 'vitest'
import { createCopyrightAcceptedPageFixture } from '@voucha/test-helpers/data-stores/psql/copyright-accepted-page'
import { listAcceptedCopyrightNotices } from './read-models.mts'

describe('accepted copyright notice pages', () => {
  it('counts targets after paging, skips empty cases, and paginates tied acceptance times', async () => {
    const fixture = await createCopyrightAcceptedPageFixture()
    try {
      const upperId = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
      const first = await listAcceptedCopyrightNotices({
        limit: 1,
        after: { timestamp: fixture.acceptedAt, id: upperId },
      })
      expect(first.notices).toHaveLength(1)
      expect(first.notices[0]).toMatchObject({ id: fixture.noticeIds[0], target_count: 2 })
      expect(first.hasNextPage).toBe(true)
      const second = await listAcceptedCopyrightNotices({
        limit: 1,
        after: { timestamp: first.notices[0]!.cursor_accepted_at, id: first.notices[0]!.id },
      })
      expect(second.notices[0]).toMatchObject({ id: fixture.noticeIds[2], target_count: 1 })
      expect(second.notices.some(notice => notice.id === fixture.noticeIds[1])).toBe(false)
    } finally {
      await fixture.cleanup()
    }
  })
})
