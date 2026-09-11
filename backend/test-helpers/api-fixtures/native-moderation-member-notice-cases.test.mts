import { describe, expect, it } from 'vitest'
import { nativeModerationMemberNoticeApiFixtureCases } from './native-moderation-member-notice-cases.mts'

describe('native moderation member-notice fixtures', () => {
  it('covers both removal discriminants, nullable platform community, and continuation', () => {
    const [firstPage, secondPage] = nativeModerationMemberNoticeApiFixtureCases
    const firstBody = firstPage!.body as {
      removed_posts: Array<{ post_id: string; post_removal_kind: string }>
      page_info: { end_cursor: string | null }
    }
    const secondBody = secondPage!.body as {
      removed_posts: Array<{ community_id: string | null; post_removal_kind: string }>
    }

    expect(new Set(firstBody.removed_posts.map(post => post.post_removal_kind))).toEqual(
      new Set(['platform', 'community']),
    )
    expect(new Set(firstBody.removed_posts.map(post => post.post_id)).size).toBe(1)
    expect(firstBody.page_info.end_cursor).toBe(secondPage!.query?.after)
    expect(secondBody.removed_posts).toContainEqual(
      expect.objectContaining({ community_id: null, post_removal_kind: 'platform' }),
    )
  })
})
