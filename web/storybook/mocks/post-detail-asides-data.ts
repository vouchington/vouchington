import { posts } from '@/storybook/entities/fixtures/posts'
import { topics } from '@/storybook/entities/fixtures/topics'
import { publicUsers } from '@/storybook/entities/fixtures/users'
import type { EntityRelation } from '@/lib/api/entity-relations'
import type { PrioritizedReferralLinksResponse } from '@/types/api-responses'
import type { HnDiscussionThread } from '@/lib/hn-discussions/search'

export const postAsideTopicRelations: EntityRelation[] = [
  {
    id: 'story-post-topic-relation',
    object_id: topics[0]!.id,
    created_at: '2026-05-01T00:00:00.000Z',
    created_by_id: null,
    object_data: { ...topics[0]! },
  },
]

export const postAsidePostRelations: EntityRelation[] = [
  {
    id: 'story-post-related-relation',
    object_id: posts[1]!.id,
    created_at: '2026-05-01T00:00:00.000Z',
    created_by_id: null,
    object_data: { ...posts[1]! },
  },
]

export const postAsideUrlRelations: EntityRelation[] = [
  {
    id: 'story-post-url-relation',
    object_id: 'story-post-related-url',
    created_at: '2026-05-01T00:00:00.000Z',
    created_by_id: null,
    object_data: {
      id: 'story-post-related-url',
      url: 'https://example.com/story',
      title: 'Related discussion',
    },
  },
]

export function postAsideReferralResponse(programId: string): PrioritizedReferralLinksResponse {
  const user = publicUsers[0]!
  return {
    links: [
      {
        id: 'story-post-referral-link',
        user_id: user.id,
        is_official: false,
        referral_program_id: programId,
        url: 'https://example.com/referral',
        label: 'Community referral link',
        priority_group: 1,
        contribution_rank: 1,
        tier_rank: 1,
        best_score: 10,
        review_post_id: null,
        review_post_slug: null,
        review_avg_rating: null,
      },
    ],
    users: {
      [user.id]: { id: user.id, username: user.username ?? 'alex', display_name: 'Alex Morgan' },
    },
  }
}

export const postAsideHnThreads: HnDiscussionThread[] = [
  {
    objectID: '424242',
    title: 'Show HN: Community discussion',
    score: 12,
    commentCount: 3,
    itemUrl: 'https://news.ycombinator.com/item?id=424242',
  },
]
