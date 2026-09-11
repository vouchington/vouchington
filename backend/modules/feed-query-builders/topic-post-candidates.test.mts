import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE,
  POST_TOPIC_CATEGORY_RELATION_TABLE,
} from '@voucha/types/entities/entity-relation-tables'
import {
  buildTopicAliasMembershipExists,
  buildTopicMembershipExists,
  buildTopicPostCandidateSelect,
  buildUniversalTopicPostCandidatePairsSelect,
} from './topic-post-candidates.mts'

// Collapses SQL comments and whitespace so a candidate body can be compared for structural
// equality across two different placeholder conventions ($1/$2 vs. an outer-query column ref).
function normalizeSqlFragment(raw: string): string {
  return raw
    .split('\n')
    .map(line => line.replace(/--.*$/, ''))
    .join(' ')
    .replace(/\$\d+/g, '$PARAM')
    .replace(/\s+/g, ' ')
    .trim()
}

describe('buildTopicPostCandidateSelect', () => {
  it('selects candidate post ids from the direct and alias relations', () => {
    const select = buildTopicPostCandidateSelect('topic-1')

    expect(select.text).toContain(`FROM ${POST_TOPIC_CATEGORY_RELATION_TABLE}`)
    expect(select.text).toContain(`JOIN ${POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE}`)
    expect(select.text).toContain('UNION ALL')
    expect(select.values).toEqual(['topic-1', 'topic-1'])
  })

  it('stays textually identical to the count__discussions candidate body in the view', () => {
    const viewPath = fileURLToPath(
      new URL('../../data-stores/psql/views/2025-01-19-topic-metrics.sql', import.meta.url),
    )
    const viewSql = readFileSync(viewPath, 'utf8')
    const start = viewSql.indexOf('SELECT rel.subject_id AS post_id')
    const endMarker = 'WHERE alias.topic_id = topic_metrics.topic_id'
    const end = viewSql.indexOf(endMarker) + endMarker.length
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)

    const viewCandidateBody = viewSql
      .slice(start, end)
      .replace(/topic_metrics\.topic_id/g, '$PARAM')

    const builderSql = buildTopicPostCandidateSelect('unused').text

    expect(normalizeSqlFragment(builderSql)).toBe(normalizeSqlFragment(viewCandidateBody))
  })
})

describe('buildUniversalTopicPostCandidatePairsSelect', () => {
  it('selects (post_id, topic_id) pairs across all four attachment shapes', () => {
    const select = buildUniversalTopicPostCandidatePairsSelect(['topic-1', 'topic-2'])

    expect(select.text).toContain(`FROM ${POST_TOPIC_CATEGORY_RELATION_TABLE}`)
    expect(select.text).toContain(`FROM ${POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE}`)
    expect(select.text).toContain('FROM post_review_topic_ratings')
    expect(select.text).toContain('FROM post_data_point_topics')
    expect(select.values).toEqual([
      ['topic-1', 'topic-2'],
      ['topic-1', 'topic-2'],
      ['topic-1', 'topic-2'],
      ['topic-1', 'topic-2'],
    ])
  })
})

describe('buildTopicMembershipExists', () => {
  it('throws for an invalid postIdColumn', () => {
    expect(() => buildTopicMembershipExists('posts.id; DROP TABLE users', 'topic-1')).toThrow(
      'Invalid postIdColumn format: posts.id; DROP TABLE users',
    )
  })

  it('throws for a bare column name without a table prefix', () => {
    expect(() => buildTopicMembershipExists('id', 'topic-1')).toThrow(
      'Invalid postIdColumn format: id',
    )
  })

  it('builds a candidate-bind IN over the direct and alias relations, not a correlated EXISTS', () => {
    const membership = buildTopicMembershipExists('candidate_post.id', 'topic-1')

    expect(membership.text).toContain('candidate_post.id IN (')
    expect(membership.text).toContain('SELECT candidate.post_id')
    expect(membership.text).toContain(`FROM ${POST_TOPIC_CATEGORY_RELATION_TABLE}`)
    expect(membership.text).toContain(POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE)
    expect(membership.text).not.toContain('EXISTS (')
    expect(membership.values).toContain('topic-1')
  })

  it('reuses buildTopicPostCandidateSelect verbatim as its candidate body', () => {
    const membership = buildTopicMembershipExists('candidate_post.id', 'topic-1')
    const candidateSelect = buildTopicPostCandidateSelect('topic-1')

    expect(normalizeSqlFragment(membership.text)).toContain(
      normalizeSqlFragment(candidateSelect.text),
    )
  })
})

describe('buildTopicAliasMembershipExists', () => {
  it('throws for an invalid postIdColumn', () => {
    expect(() => buildTopicAliasMembershipExists('posts.id; DROP TABLE users', 'alias-1')).toThrow(
      'Invalid postIdColumn format: posts.id; DROP TABLE users',
    )
  })

  it('throws for a bare column name without a table prefix', () => {
    expect(() => buildTopicAliasMembershipExists('id', 'alias-1')).toThrow(
      'Invalid postIdColumn format: id',
    )
  })

  it('builds a correlated EXISTS over only the alias relation', () => {
    const exists = buildTopicAliasMembershipExists('candidate_post.id', 'alias-1')

    expect(exists.text).toContain('EXISTS (')
    expect(exists.text).toContain(`FROM ${POST_TOPIC_ALIAS_CATEGORY_RELATION_TABLE}`)
    expect(exists.text).not.toContain(`FROM ${POST_TOPIC_CATEGORY_RELATION_TABLE} `)
    expect(exists.text).toContain('relation.subject_id = candidate_post.id')
    expect(exists.values).toContain('alias-1')
  })
})
