import type { PostsResponseBody, Post, PostType } from './types'
import { now, page_info } from './shared'
import { publicUsers } from './users'
import { topics } from './topics'

const postTitles: Array<[PostType, string]> = [
  ['discussion', 'Best premium card for restaurants?'],
  ['review', 'My first year with Sapphire Reserve'],
  ['data_point', 'Approved with 720 score'],
  ['story', 'How I booked a family trip on points'],
  ['article', 'Guide to transfer partners'],
  ['blog_post', 'Product update roundup'],
  ['comment', 'Thread reply with context'],
]
export const posts = postTitles.map(([post_type, title], index) => ({
  id: `post-${post_type}`,
  post_type,
  title,
  slug: `fixture-${post_type}`,
  markdown:
    post_type === 'data_point'
      ? 'Applied online and received an instant decision. Income verified through account connection.'
      : 'This fixture includes enough body text to exercise excerpts, badges, bylines, ratings, and related topic chips.',
  parent_id: post_type === 'comment' ? 'post-discussion' : null,
  root_id: post_type === 'comment' ? 'post-discussion' : null,
  created_by_id: publicUsers[0]!.id,
  created_by: {
    __entity_type: 'user',
    id: publicUsers[0]!.id,
    username: publicUsers[0]!.username!,
    profile_image_id: null,
  },
  created_at: now,
  updated_at: now,
  deleted_at: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  broadcast: index % 2 === 0 ? 'everyone' : 'followers',
  privacy: 'public',
  is_anonymous: false,
  community_id: index === 0 ? 'community-credit-cards' : null,
  review_topic_ratings:
    post_type === 'review'
      ? [{ topic_id: topics[1]!.id, rating: 5, order_index: 0, updated_at: now, topic: topics[1] }]
      : [],
  post_related_topics: topics.slice(0, 3).map(topic => ({
    __entity_type: 'topic',
    id: topic.id,
    name: topic.name,
    slug: topic.slug,
    topic_type: topic.topic_type,
    referral_program_id: topic.referral_program_id,
  })),
  data_point_vertical: post_type === 'data_point' ? 'credit_card' : null,
  structured_data:
    post_type === 'data_point'
      ? {
          result: 'approved',
          currency: 'usd',
          credit_score_range: '700-749',
          credit_limit: { amount: 1_200_000, currency: 'usd' },
        }
      : null,
})) as unknown as Post[]
export const postsResponse: PostsResponseBody = {
  results: posts.map(post => ({
    __entity_type: 'post',
    id: post.id,
    ranking: 1,
    search_vector_ts: null,
    entity_id: post.id,
    post_type: post.post_type,
  })),
  page_info,
  posts: Object.fromEntries(posts.map(post => [post.id, post])),
  posts_metrics: Object.fromEntries(
    posts.map((post, index) => [
      post.id,
      {
        __entity_type: 'post_metrics',
        id: post.id,
        count: { descendants: 3 + index, children: 2, shares: index },
        bookmarks: { follow: 7 + index },
      },
    ]),
  ),
  post_elections: Object.fromEntries(
    posts.map((post, index) => [
      post.id,
      {
        __entity_type: 'post_election',
        id: `post-election-${post.id}`,
        post_id: post.id,
        votes_score_net: 16 + index,
        votes_count_up: 20 + index,
        votes_count_down: index,
      },
    ]),
  ),
  markdown_to_html: Object.fromEntries(posts.map(post => [post.id, `<p>${post.markdown}</p>`])),
  users: Object.fromEntries(publicUsers.map(user => [user.id, user])),
} as unknown as PostsResponseBody
