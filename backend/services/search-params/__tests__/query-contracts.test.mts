import { describe, expect, expectTypeOf, it } from 'vitest'
import { parsePostsSearchParams } from '../parse-posts.mts'
import { parseTopicsSearchParams } from '../parse-topics.mts'
import { parseHostnamesSearchParams } from '../parse-hostnames.mts'
import { parseRssFeedsSearchParams } from '../parse-rss-feeds.mts'
import { parseRssFeedItemsSearchParams } from '../parse-rss-feed-items.mts'
import { withInternalOmitLimit } from '../types.mts'

function sortedParameterNames(queryContract: Readonly<Record<string, unknown>>): string[] {
  return Object.keys(queryContract).toSorted()
}

describe('search parameter query contracts', () => {
  it('publishes the complete posts query contract', () => {
    expect(sortedParameterNames(parsePostsSearchParams.queryContract)).toEqual(
      [
        'after',
        'category',
        'categories',
        'creator',
        'data_point_topic',
        'data_point_vertical',
        'drafts',
        'limit',
        'post_types',
        'q',
        'review_topic',
        'semantic_search_query',
        'similar_post',
        'similar_rss_feed_item',
        'similar_topic',
        'sort',
        'story_id',
        'text_search_query',
        'time_range',
        'topic',
        'topics',
        'url',
      ].toSorted(),
    )
    expect(parsePostsSearchParams.queryContract).not.toHaveProperty('omitLimit')
  })

  it('publishes the complete topics query contract', () => {
    expect(sortedParameterNames(parseTopicsSearchParams.queryContract)).toEqual(
      [
        'after',
        'limit',
        'q',
        'rss_feed',
        'semantic_search_query',
        'similar_post',
        'similar_rss_feed_item',
        'similar_topic',
        'slugs',
        'sort',
        'spending_category',
        'text_search_query',
        'topic_types',
      ].toSorted(),
    )
    expect(parseTopicsSearchParams.queryContract).not.toHaveProperty('omitLimit')
  })

  it('publishes the complete hostnames query contract', () => {
    expect(sortedParameterNames(parseHostnamesSearchParams.queryContract)).toEqual(
      [
        'after',
        'blocked',
        'crawlable',
        'hostname',
        'include_descendants',
        'limit',
        'query',
        'sort',
        'topic',
        'topic_match',
        'topics',
      ].toSorted(),
    )
    expect(parseHostnamesSearchParams.queryContract.limit).toEqual({
      kind: 'integer',
      minimum: 1,
      maximum: 100,
      default: 50,
    })
  })

  it('publishes RSS feed metadata without route-owned pagination', () => {
    expect(sortedParameterNames(parseRssFeedsSearchParams.queryContract)).toEqual(
      [
        'category',
        'discoverable',
        'enabled',
        'feed_type',
        'include_descendants',
        'publisher_type',
        'publisher_type_match',
        'publisher_types',
        'q',
        'text_search_query',
        'topic',
        'topic_match',
        'topics',
      ].toSorted(),
    )
    expect(parseRssFeedsSearchParams.queryContract).not.toHaveProperty('limit')
    expect(parseRssFeedsSearchParams.queryContract).not.toHaveProperty('after')
  })

  it('publishes RSS feed item media aliases through pagination metadata', () => {
    expect(sortedParameterNames(parseRssFeedItemsSearchParams.queryContract)).toEqual(
      [
        'after',
        'category_topic',
        'category_topics',
        'has_related_posts',
        'limit',
        'media_type',
        'media_types',
        'q',
        'read',
        'rss_feed',
        'rss_feeds',
        'semantic_search_query',
        'similar_window_days',
        'story_id',
        'text_search_query',
        'topic',
        'topics',
      ].toSorted(),
    )
    expect(parseRssFeedItemsSearchParams.queryContract.media_type).toEqual({
      kind: 'enum',
      values: ['article', 'audio', 'video'],
    })
    expect(parseRssFeedItemsSearchParams.queryContract.media_types).toMatchObject({
      kind: 'csv-array',
      style: 'form',
      explode: false,
    })
  })

  it('adds internal limit control without exposing it on parsed input', () => {
    const parsedOptions = { limit: 25 }
    const internalOptions = withInternalOmitLimit(parsedOptions)

    expect(internalOptions).toBe(parsedOptions)
    expect(internalOptions).not.toHaveProperty('omitLimit')
    expectTypeOf(internalOptions.omitLimit).toEqualTypeOf<boolean | undefined>()

    internalOptions.omitLimit = false
    expect(internalOptions).toHaveProperty('omitLimit', false)

    // @ts-expect-error -- public parsing must not populate internal limit control
    withInternalOmitLimit({ limit: 25, omitLimit: true })
  })

  it('rejects broad search option records that can contain internal limit control', () => {
    const broadSearchOptions: Record<string, unknown> = { limit: 25, omitLimit: true }

    expect(broadSearchOptions).toHaveProperty('omitLimit', true)

    // @ts-expect-error -- an index signature can already contain internal limit control
    withInternalOmitLimit(broadSearchOptions)
  })

  it('rejects search option unions when any member can contain internal limit control', () => {
    function makeUnionSearchOptions(
      includeInternalControl: boolean,
    ): { limit: number } | { limit: number; omitLimit: boolean } {
      return includeInternalControl ? { limit: 25, omitLimit: true } : { limit: 25 }
    }
    const unionSearchOptions = makeUnionSearchOptions(true)

    expect(unionSearchOptions).toHaveProperty('omitLimit', true)

    // @ts-expect-error -- every union member must exclude internal limit control
    withInternalOmitLimit(unionSearchOptions)
  })
})
