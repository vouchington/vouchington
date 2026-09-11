import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertRequiredPlanShape } from './plan-gates.mts'

function result(scenarioId: string, queryText: string, plan: unknown): ExplainResult {
  const root = (plan as { Plan?: Record<string, unknown> } | null)?.Plan
  return {
    name: scenarioId,
    scenario_id: scenarioId,
    query_text: queryText,
    plan: root ? { ...(plan as object), Plan: { ...root, 'Actual Rows': 1 } } : plan,
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: new Date().toISOString(),
  }
}

describe('required EXPLAIN plan shapes', () => {
  it('requires universal-topic candidates to drive indexed post lookups', () => {
    const candidateDriven = result('post-search-universal-topic', 'SELECT posts', {
      Plan: {
        'Node Type': 'Nested Loop',
        Plans: [
          { 'Node Type': 'Index Scan', 'Relation Name': 'post_review_topic_ratings__default' },
          {
            'Node Type': 'Index Scan',
            'Relation Name': 'posts__default',
            Alias: 'posts',
            'Index Cond': '(id = post_review_topic_ratings.post_id)',
          },
        ],
      },
    })
    expect(() => assertRequiredPlanShape(candidateDriven)).not.toThrow()

    const postScan = result('post-search-universal-topic', 'SELECT posts', {
      Plan: { 'Node Type': 'Seq Scan', 'Relation Name': 'posts__default', Alias: 'posts' },
    })
    expect(() => assertRequiredPlanShape(postScan)).toThrow('reverse-indexed candidates')
  })

  it('requires user removed-post pages to use the owner/rejection index', () => {
    const indexed = result('user-removed-posts-page', 'SELECT FROM posts', {
      Plan: {
        'Node Type': 'Index Scan',
        'Relation Name': 'posts__default',
        'Index Name': 'idx_posts__default__created_by_rejected_at_id',
      },
    })
    expect(() => assertRequiredPlanShape(indexed)).not.toThrow()

    const scanned = result('user-removed-posts-page', 'SELECT FROM posts', {
      Plan: { 'Node Type': 'Seq Scan', 'Relation Name': 'posts__default' },
    })
    expect(() => assertRequiredPlanShape(scanned)).toThrow('platform removals through')
  })

  it('rejects RSS state plans that scan history relations', () => {
    const historyScan = result('rss-feed-search', 'FROM view_rss_feed_current_states', {
      Plan: { 'Node Type': 'Index Scan', 'Relation Name': 'rss_feed_enablement_changes' },
    })
    expect(() => assertRequiredPlanShape(historyScan)).toThrow('without lateral history scans')
  })

  it('rejects explicit sorts in relation listings', () => {
    const sorted = result('entity-relations-best', 'SELECT relations', {
      Plan: { 'Node Type': 'Sort' },
    })
    expect(() => assertRequiredPlanShape(sorted)).toThrow('without an explicit Sort')
  })

  it.each([
    ['direct-message-inbox-page', 'idx_conversations__direct_message_updated'],
    ['modmail-inbox-page', 'idx_conversations__modmail_community_updated'],
  ])('requires %s to use its ordered composite index', (scenarioId, indexName) => {
    const indexed = result(scenarioId, 'SELECT conversations', {
      Plan: { 'Node Type': 'Index Scan', 'Index Name': indexName },
    })
    expect(() => assertRequiredPlanShape(indexed)).not.toThrow()

    const sorted = result(scenarioId, 'SELECT conversations', {
      Plan: {
        'Node Type': 'Sort',
        Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 'conversations' }],
      },
    })
    expect(() => assertRequiredPlanShape(sorted)).toThrow('without an explicit Sort')
  })

  it('requires individual-card pages to use owner-scoped UUID index order', () => {
    const indexed = result('individual-cards-page', 'SELECT id FROM individual_cards', {
      Plan: {
        'Node Type': 'Index Scan',
        'Index Name': 'idx_individual_cards__individual_id_id',
      },
    })
    expect(() => assertRequiredPlanShape(indexed)).not.toThrow()

    const sorted = result('individual-cards-page', 'SELECT id FROM individual_cards', {
      Plan: {
        'Node Type': 'Sort',
        Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 'individual_cards' }],
      },
    })
    expect(() => assertRequiredPlanShape(sorted)).toThrow('without an explicit Sort')
  })

  it('requires point-valuation pages to use owner-scoped UUID index order', () => {
    const indexed = result(
      'point-valuations-page',
      'SELECT id FROM individual_rewards_program_point_valuations',
      {
        Plan: {
          'Node Type': 'Index Scan',
          'Index Name': 'idx_ind_rp_point_valuations__individual_id_id',
        },
      },
    )
    expect(() => assertRequiredPlanShape(indexed)).not.toThrow()

    const sorted = result(
      'point-valuations-page',
      'SELECT id FROM individual_rewards_program_point_valuations',
      {
        Plan: {
          'Node Type': 'Sort',
          Plans: [
            {
              'Node Type': 'Seq Scan',
              'Relation Name': 'individual_rewards_program_point_valuations',
            },
          ],
        },
      },
    )
    expect(() => assertRequiredPlanShape(sorted)).toThrow('without an explicit Sort')
  })

  it('requires rewards-program-status pages to use owner-scoped UUID index order', () => {
    const indexed = result(
      'rewards-program-statuses-page',
      'SELECT id FROM individual_rewards_program_statuses',
      {
        Plan: { 'Node Type': 'Index Scan', 'Index Name': 'idx_ind_rp_statuses__individual_id_id' },
      },
    )
    expect(() => assertRequiredPlanShape(indexed)).not.toThrow()

    const sorted = result(
      'rewards-program-statuses-page',
      'SELECT id FROM individual_rewards_program_statuses',
      { Plan: { 'Node Type': 'Sort', Plans: [{ 'Node Type': 'Seq Scan' }] } },
    )
    expect(() => assertRequiredPlanShape(sorted)).toThrow('without an explicit Sort')
  })

  it('requires private saved-post pages to use the scoped composite relation index', () => {
    const indexed = result(
      'profile-posts-page',
      'SELECT object_id FROM relation__user__save__post',
      {
        Plan: {
          'Node Type': 'Index Scan',
          'Index Name': 'idx_relation__user__save__post__subject__newest',
        },
      },
    )
    expect(() => assertRequiredPlanShape(indexed)).not.toThrow()

    const sorted = result(
      'profile-posts-page',
      'SELECT object_id FROM relation__user__save__post',
      { Plan: { 'Node Type': 'Sort', Plans: [{ 'Node Type': 'Seq Scan' }] } },
    )
    expect(() => assertRequiredPlanShape(sorted)).toThrow('without an explicit Sort')
  })

  it('requires global RSS feed item cursor pages to use the published-at keyset index', () => {
    const indexed = result(
      'rss-feed-items-search-global-cursor',
      'SELECT id FROM rss_feed_items ORDER BY rss_feed_items.published_at DESC, rss_feed_items.id DESC',
      {
        Plan: {
          'Node Type': 'Limit',
          Plans: [
            {
              'Node Type': 'Index Scan',
              'Relation Name': 'rss_feed_items',
              'Index Name': 'idx_rss_feed_items__published_at__id',
            },
            {
              'Node Type': 'Sort',
              'Sort Key': ['ranked.published_at DESC', 'ranked.id DESC'],
            },
          ],
        },
      },
    )
    expect(() => assertRequiredPlanShape(indexed)).not.toThrow()

    const partitionIndexed = result(
      'rss-feed-items-search-global-cursor',
      'SELECT id FROM rss_feed_items ORDER BY rss_feed_items.published_at DESC, rss_feed_items.id DESC',
      {
        Plan: {
          'Node Type': 'Index Scan',
          'Relation Name': 'rss_feed_items_default',
          'Index Name': 'rss_feed_items_default_published_at_id_idx',
        },
      },
    )
    expect(() => assertRequiredPlanShape(partitionIndexed)).not.toThrow()

    const scanned = result(
      'rss-feed-items-search-global-cursor',
      'SELECT id FROM rss_feed_items ORDER BY rss_feed_items.published_at DESC, rss_feed_items.id DESC',
      {
        Plan: {
          'Node Type': 'Sort',
          Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 'rss_feed_items_default' }],
        },
      },
    )
    expect(() => assertRequiredPlanShape(scanned)).toThrow('idx_rss_feed_items__published_at__id')
  })

  it.each([
    ['post-child-by-post', 'post_id', 'post_review_topic_ratings__default'],
    ['crawl-chunks-by-crawl', 'crawl_id', 'crawl_chunks__default'],
    ['conversation-messages', 'conversation_id', 'conversation_messages__default'],
  ])('requires %s to scan exactly one partition child', (scenarioId, key, child) => {
    const pruned = result(scenarioId, `SELECT * FROM parent WHERE ${key} = $1`, {
      Plan: { 'Node Type': 'Seq Scan', 'Relation Name': child },
    })
    expect(() => assertRequiredPlanShape(pruned)).not.toThrow()

    const fanout = result(scenarioId, `SELECT * FROM parent WHERE ${key} = $1`, {
      Plan: {
        'Node Type': 'Append',
        Plans: [
          { 'Node Type': 'Seq Scan', 'Relation Name': child },
          { 'Node Type': 'Seq Scan', 'Relation Name': child.replace('__default', '__p_other') },
        ],
      },
    })
    expect(() => assertRequiredPlanShape(fanout)).toThrow('exactly one partition child')
  })

  it('requires entity-relation vote lookups to prune both partition levels', () => {
    const queryText =
      'SELECT * FROM entity_relation_votes WHERE relation_table = $1 AND entity_relation_id = $2'
    const pruned = result('entity-relation-votes-by-target', queryText, {
      Plan: {
        'Node Type': 'Seq Scan',
        'Relation Name': 'relation__post__category__topic__votes__default',
      },
    })
    expect(() => assertRequiredPlanShape(pruned)).not.toThrow()

    const fanout = result('entity-relation-votes-by-target', queryText, {
      Plan: {
        'Node Type': 'Append',
        Plans: [
          {
            'Node Type': 'Seq Scan',
            'Relation Name': 'relation__post__category__topic__votes__default',
          },
          {
            'Node Type': 'Seq Scan',
            'Relation Name': 'relation__topic__related__post__votes__default',
          },
        ],
      },
    })
    expect(() => assertRequiredPlanShape(fanout)).toThrow('both partition levels')
  })

  it('requires spending-category pages to use personal and household UUID index order', () => {
    const indexed = result('spending-categories-page', 'SELECT id FROM spending_entries', {
      Plan: {
        'Node Type': 'Merge Append',
        Plans: [
          { 'Node Type': 'Index Scan', 'Index Name': 'idx_spending_entries__individual_id_id' },
          { 'Node Type': 'Index Scan', 'Index Name': 'idx_spending_entries__household_id_id' },
        ],
      },
    })
    expect(() => assertRequiredPlanShape(indexed)).not.toThrow()

    const personalOnly = result('spending-categories-page', 'SELECT id FROM spending_entries', {
      Plan: {
        'Node Type': 'Index Scan',
        'Index Name': 'idx_spending_entries__individual_id_id',
      },
    })
    expect(() => assertRequiredPlanShape(personalOnly)).toThrow(
      'idx_spending_entries__household_id_id',
    )
  })
})
