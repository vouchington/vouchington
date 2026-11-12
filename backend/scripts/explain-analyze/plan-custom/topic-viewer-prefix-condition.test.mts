import { describe, expect, it } from 'vitest'
import { NIL, MAX } from 'uuid'
import { validTopicViewerPrefixCondition } from './topic-viewer-prefix-condition.mts'

const input = { cte: 'viewer_review_inputs', relation: 'post_review_topic_ratings' }
const topic = "'019e0000-0400-7000-8000-000000000960'::uuid"
const other = "'019e0000-0400-7000-8000-000000000961'::uuid"
const min = `'${NIL}'::uuid`
const max = `'${MAX}'::uuid`
const source = `WITH viewer_review_inputs AS MATERIALIZED (
 SELECT post_id FROM post_review_topic_ratings
 WHERE (topic_id, post_id) >= ($12::uuid, $13::uuid)
 AND (topic_id, post_id) <= ($14::uuid, $15::uuid)
 ORDER BY topic_id, post_id LIMIT $16
)`
const range = (lowerTopic: string, lower: string, upperTopic: string, upper: string) =>
  `((ROW(topic_id, post_id) >= ROW(${lowerTopic}, ${lower})) AND (ROW(topic_id, post_id) <= ROW(${upperTopic}, ${upper})))`

describe('canonical topic attachment interval', () => {
  it('accepts the full UUID domain for one literal topic', () => {
    expect(validTopicViewerPrefixCondition(range(topic, min, topic, max), input, source)).toBe(true)
  })
  it('accepts the exact four generic bindings of its materialized input', () => {
    expect(validTopicViewerPrefixCondition(range('$12', '$13', '$14', '$15'), input, source)).toBe(
      true,
    )
  })
  it.each([
    range(topic, min, other, max),
    range(topic, max, topic, min),
    range(topic, topic, topic, max),
    range(topic, min, topic, topic),
    range('$99', '$13', '$14', '$15'),
    range('$12', '$13', '$99', '$15'),
    range('$12', '$15', '$14', '$13'),
    range('$12', '$13', '$14', '$99'),
    range('$12', min, '$14', max),
    `ROW(topic_id, post_id) >= ROW(${topic}, ${min})`,
    range(topic, min, topic, max).replace('AND', 'OR'),
    range(topic, min, topic, max).replace('>=', '>'),
    range(topic, min, topic, max).replace('<=', '<'),
    range(topic, min, topic, max).replaceAll('topic_id, post_id', 'post_id, topic_id'),
  ])('rejects an incomplete, mismatched or noncanonical bound: %s', condition => {
    expect(validTopicViewerPrefixCondition(condition, input, source)).toBe(false)
  })
  it.each([
    source.replace('viewer_review_inputs', 'unrelated_input'),
    source.replace('post_review_topic_ratings', 'post_data_point_topics'),
    source.replace('MATERIALIZED', 'NOT MATERIALIZED'),
    source.replace('ORDER BY topic_id, post_id', 'ORDER BY post_id'),
    '',
  ])('rejects generic ranges without their canonical input source', query => {
    expect(validTopicViewerPrefixCondition(range('$12', '$13', '$14', '$15'), input, query)).toBe(
      false,
    )
  })
})
