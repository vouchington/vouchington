import type { MessageKey } from '@ts-shared/ui-messages'
import type { TopicTypes } from '@/types/topics'

export interface TagRelationTab {
  label: MessageKey
  value: string
  predicate: string
  objectType: 'topic' | 'post' | 'url'
}

export const postTagTabs: TagRelationTab[] = [
  {
    label: 'extracted.tags.tagRelationConfigs.categoryTopics_d1554d2f',
    value: 'topic',
    predicate: 'category',
    objectType: 'topic',
  },
  {
    label: 'extracted.tags.tagRelationConfigs.relatedPosts_bddb629f',
    value: 'post',
    predicate: 'related',
    objectType: 'post',
  },
  {
    label: 'extracted.tags.tagRelationConfigs.relatedLinks_e9bb3cb1',
    value: 'url',
    predicate: 'related',
    objectType: 'url',
  },
]

export const topicTagTabs: TagRelationTab[] = [
  {
    label: 'extracted.tags.tagRelationConfigs.relatedTopics_aea370bc',
    value: 'topic',
    predicate: 'related',
    objectType: 'topic',
  },
  {
    label: 'extracted.tags.tagRelationConfigs.categories_b8b1d894',
    value: 'category',
    predicate: 'category',
    objectType: 'topic',
  },
  {
    label: 'extracted.tags.tagRelationConfigs.publisherType_9b943044',
    value: 'publisher_type',
    predicate: 'publisher_type',
    objectType: 'topic',
  },
  {
    label: 'extracted.tags.tagRelationConfigs.faqPosts_09edffc6',
    value: 'post',
    predicate: 'faq',
    objectType: 'post',
  },
  {
    label: 'extracted.tags.tagRelationConfigs.landingPage_a93cb7c7',
    value: 'landing_page',
    predicate: 'landing_page',
    objectType: 'url',
  },
  {
    label: 'extracted.tags.tagRelationConfigs.termsOfService_4afa55bf',
    value: 'terms_of_service',
    predicate: 'terms_of_service',
    objectType: 'url',
  },
]

const topicTagSegmentSet = new Set(topicTagTabs.map(t => t.value))
const sourceOnlyTopicTagSegmentSet = topicTagTabs.reduce((values, tab) => {
  if (tab.value === 'publisher_type') values.add(tab.value)
  return values
}, new Set<string>())

export function isTopicTagSegment(value: string): boolean {
  return topicTagSegmentSet.has(value)
}

export function getTopicTagTabsForTopicType(
  topicType: TopicTypes | null | undefined,
): readonly TagRelationTab[] {
  if (topicType === 'rss_feed') return topicTagTabs
  return topicTagTabs.filter(tab => !sourceOnlyTopicTagSegmentSet.has(tab.value))
}

export function isTopicTagSegmentForTopicType(
  value: string,
  topicType: TopicTypes | null | undefined,
): boolean {
  return getTopicTagTabsForTopicType(topicType).some(tab => tab.value === value)
}

export const TAG_ASIDE_SEARCH_PARAMS = { positiveNetVoteScore: true, sort: 'best' } as const
export const POST_RELATED_URL_SUMMARY_SEARCH_PARAMS = { summary: true } as const
