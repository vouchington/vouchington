import { seedUuid, seedUuidAtTimestamp } from './common.mts'

const TOPIC_START = 9_968
const TOPIC_COUNT = 32
const ITEMS_PER_TOPIC = 33
const STORY_ITEM_COUNT = 9

export const RSS_AT_CAP_STORY_ID = seedUuid(17, '17')
export const RSS_AT_CAP_STORY_TOKEN = 'rsscandidatecapstory'
export const RSS_AT_CAP_OUTSIDE_TOPIC_GUID = 'rss-candidate-at-cap-outside-topic'

export function buildRssFeedCandidateAtCapRows(now: number) {
  const rows = Array.from({ length: TOPIC_COUNT * ITEMS_PER_TOPIC }, (_, index) => {
    const topicOffset = Math.floor(index / ITEMS_PER_TOPIC)
    const topicIndex = TOPIC_START + topicOffset
    const itemOffset = index % ITEMS_PER_TOPIC
    const isStoryMember = topicOffset === 0 && itemOffset < STORY_ITEM_COUNT
    const ageSeconds = isStoryMember
      ? 5 + itemOffset / 10
      : itemOffset === 0
        ? topicOffset + 5
        : 500
    return {
      id: seedUuidAtTimestamp(now - 1000, 10_000_000 + index),
      hostname_id: seedUuid(0, '02'),
      guid: `rss-candidate-at-cap-item-${index}`,
      url_id: seedUuid(2500, '03'),
      data: {
        title: `RSS candidate at-cap item ${index}${
          isStoryMember ? ` ${RSS_AT_CAP_STORY_TOKEN}` : ''
        }`,
        link: `https://example.com/rss-candidate-at-cap/${index}`,
        isoDate: new Date(now - ageSeconds * 1000).toISOString(),
      },
      topic_id: seedUuid(topicIndex, '04'),
      rss_feed_id: seedUuid(2, '08'),
    }
  })
  const outsideTopic = {
    id: seedUuidAtTimestamp(now - 1000, 12_000_001),
    hostname_id: seedUuid(0, '02'),
    guid: RSS_AT_CAP_OUTSIDE_TOPIC_GUID,
    url_id: seedUuid(2500, '03'),
    data: {
      title: 'RSS candidate outside first source cap',
      link: 'https://example.com/rss-candidate-at-cap-outside-topic',
      isoDate: new Date(now - (TOPIC_COUNT + 5) * 1000).toISOString(),
    },
    topic_id: seedUuid(TOPIC_START - 1, '04'),
    rss_feed_id: seedUuid(2, '08'),
  }
  return { rows, outsideTopic }
}
