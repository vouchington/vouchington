import { describe, expect, it } from 'vitest'
import { HOT_SORT_HALF_LIFE_SECONDS, buildHotScoreExpression } from './hot-score.mts'

describe('buildHotScoreExpression', () => {
  it('builds the hot score for the default posts alias', () => {
    const expression = buildHotScoreExpression()

    expect(expression.text).toContain('posts.votes_score_net')
    expect(expression.text).toContain('uuid_extract_timestamp(posts.id)')
    expect(expression.values).toEqual([HOT_SORT_HALF_LIFE_SECONDS])
  })

  it('builds the hot score for an explicit alias', () => {
    const expression = buildHotScoreExpression('p')

    expect(expression.text).toContain('p.votes_score_net')
    expect(expression.text).toContain('uuid_extract_timestamp(p.id)')
    expect(expression.text).not.toContain('posts.')
  })

  it('clamps future UUIDv7 timestamps without changing null or past semantics', () => {
    const expression = buildHotScoreExpression()

    expect(expression.text).toContain('WHEN uuid_extract_timestamp(posts.id) > NOW() THEN 0.0')
    expect(expression.text).toContain(
      'ELSE -EXTRACT(EPOCH FROM (NOW() - uuid_extract_timestamp(posts.id)))',
    )
    expect(expression.text).toContain('POWER(2.0, CASE')
    expect(expression.text).toContain('END))::DOUBLE PRECISION')
    expect(expression.text).not.toContain('COALESCE')
  })

  it('rejects unsafe SQL aliases', () => {
    expect(() => buildHotScoreExpression('p; DROP TABLE posts')).toThrow(
      'Unsafe SQL alias: p; DROP TABLE posts',
    )
  })
})
