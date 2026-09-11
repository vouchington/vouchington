import type { TopicsResponseBody, Topic, TopicTypes } from './types'
import { now, page_info, basicUser } from './shared'

// Each tuple is [topic_type, name, allow_reviews]. A not-reviewable topic
// (allow_reviews=false) replaces the former `person` type behavior.
const topicNames: Array<[TopicTypes, string, boolean]> = [
  ['topic', 'Open Banking', true],
  ['card', 'Sapphire Reserve', true],
  ['bank_account', 'High Yield Savings', true],
  ['rewards_program', 'Ultimate Rewards', true],
  ['rewards_program_status', 'Platinum Elite', true],
  ['referral_program', 'Amex Referrals', true],
  ['topic', 'Jane Analyst', false],
  ['topic', 'CEO Profile', true],
  ['topic', 'Example Credit Union', true],
  ['topic', 'TravelCo', true],
  ['rss_feed', 'Fintech Daily (https://fintech.example/feed/rss)', true],
  ['fediverse_instance', 'mastodon.example', true],
]
export const topics = topicNames.map(([topic_type, name, allow_reviews], index) => ({
  __entity_type: 'topic',
  id: `topic-${name.toLowerCase().replaceAll(' ', '-')}`,
  name,
  slug: name.toLowerCase().replaceAll(' ', '-'),
  markdown: `${name} gathers reviews, discussions, data points, and related news.`,
  aliases: [name],
  topic_type,
  noindex: false,
  allow_reviews,
  created_at: now,
  created_by: basicUser,
  updated_by: basicUser,
  logo_image_id: null,
  hero_image_id: null,
  hostname_id: null,
  hostname:
    topic_type === 'rss_feed'
      ? {
          __entity_type: 'hostname',
          id: 'hostname-fintech-example',
          hostname: 'fintech.example',
          topic_id: null,
        }
      : topic_type === 'fediverse_instance'
        ? {
            __entity_type: 'hostname',
            id: 'hostname-mastodon-example',
            hostname: 'mastodon.example',
            topic_id: null,
          }
        : null,
  rewards_program_id: topic_type === 'rewards_program_status' ? 'topic-ultimate-rewards' : null,
  referral_program_id: topic_type === 'referral_program' ? 'referral-program-1' : null,
  _index: index,
})) as unknown as Topic[]

export const topicsResponse: TopicsResponseBody = {
  results: topics.map(topic => ({
    __entity_type: 'topic',
    id: topic.id,
    name: topic.name,
    slug: topic.slug,
    topic_type: topic.topic_type,
    ranking: 1,
  })),
  page_info,
  topics: Object.fromEntries(topics.map(topic => [topic.id, topic])),
  topics_metrics: Object.fromEntries(
    topics.map((topic, index) => [
      topic.id,
      {
        __entity_type: 'topic_metrics',
        id: topic.id,
        count: {
          reviews: 12 + index,
          discussions: 5 + index,
          data_points: 3 + index,
          posts: 20 + index,
        },
        ratings: { count: { 1: 1, 2: 1, 3: 2, 4: 6 + index, 5: 9 + index } },
        bookmarks: { follow: 240 + index * 13, mute: index % 2 },
      },
    ]),
  ),
  topic_elections: Object.fromEntries(
    topics.map((topic, index) => [
      topic.id,
      {
        __entity_type: 'topic_election',
        id: `topic-election-${topic.id}`,
        topic_id: topic.id,
        votes_score_net: 18 + index,
        votes_count_up: 24 + index,
        votes_count_down: index,
      },
    ]),
  ),
  bookmarks: Object.fromEntries(
    topics.map(topic => [topic.id, { follow: topic.allow_reviews, mute: false }]),
  ),
} as unknown as TopicsResponseBody
