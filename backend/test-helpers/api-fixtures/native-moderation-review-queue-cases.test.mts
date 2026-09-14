import { decodeUuidCursor, isSimpleCursor } from '@modules/pagination'
import { getDateFromUUIDv7 } from '@modules/utils/ids'
import { describe, expect, it } from 'vitest'
import { nativeModerationReviewQueueApiFixtureCases } from './native-moderation-review-queue-cases.mts'

type ReviewQueuePage = {
  page_info: {
    end_cursor: string | null
    has_next_page: boolean
    start_cursor: string | null
  }
  results: Array<{
    created_at: string
    id: string
    moderation_summary: {
      disposition: 'pass' | 'review' | 'reject' | 'incomplete' | null
      evidence_summary: {
        flagged_category_count: number
        signal_count: number
      }
      reason_codes: string[]
    }
    media_reveal: {
      requires_reveal: boolean
      images: Array<{ image_id: string; order_index: number; caption: string }>
    }
  }>
}

describe('native moderation review queue fixtures', () => {
  it('keeps UUIDv7 ordering, timestamps, and cursors internally consistent', () => {
    const firstPageCase = fixtureCase('native.moderation.review-queue.default')
    const secondPageCase = fixtureCase('native.moderation.review-queue.page-2')
    const firstPage = firstPageCase.body as ReviewQueuePage
    const secondPage = secondPageCase.body as ReviewQueuePage
    const posts = [...firstPage.results, ...secondPage.results]

    for (const post of posts) {
      expect(getDateFromUUIDv7(post.id)?.toISOString()).toBe(post.created_at)
      expect(post.media_reveal.requires_reveal).toBe(
        post.media_reveal.images.length > 0 &&
          (post.moderation_summary.disposition === 'review' ||
            post.moderation_summary.disposition === 'reject'),
      )
      expect(post.media_reveal.images.length).toBeLessThanOrEqual(20)
      expect(post.moderation_summary.reason_codes).toEqual(expect.any(Array))
    }

    expect(firstPage.results.map(post => post.id)).toEqual(
      firstPage.results
        .map(post => post.id)
        .toSorted()
        .reverse(),
    )
    expect(decodeReviewQueueCursor(firstPage.page_info.start_cursor)).toBe(
      firstPage.results.at(0)?.id,
    )
    expect(decodeReviewQueueCursor(firstPage.page_info.end_cursor)).toBe(
      firstPage.results.at(-1)?.id,
    )
    expect(secondPageCase.query?.after).toBe(firstPage.page_info.end_cursor)
    expect(secondPage.page_info.end_cursor).toBeNull()
    expect(secondPage.page_info.has_next_page).toBe(false)
  })
})

function fixtureCase(id: string) {
  const fixture = nativeModerationReviewQueueApiFixtureCases.find(item => item.id === id)
  if (!fixture) throw new Error(`Missing fixture ${id}`)
  return fixture
}

function decodeReviewQueueCursor(cursor: string | null): string {
  if (!cursor) throw new Error('Expected an opaque review queue cursor')
  return decodeUuidCursor(cursor, isSimpleCursor, 'Invalid review queue cursor').id
}
