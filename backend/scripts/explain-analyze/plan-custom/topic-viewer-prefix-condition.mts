import { NIL, MAX } from 'uuid'

const UUID_ATOM = String.raw`(?:\$\d+|'[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}'::uuid)`
const PLAN_KEYS = String.raw`ROW\(topic_id,\s*post_id\)`
const PLAN_VALUES = String.raw`ROW\((${UUID_ATOM}),\s*(${UUID_ATOM})\)`
const PLAN_RANGE = new RegExp(
  String.raw`^\(*${PLAN_KEYS}\s*>=\s*${PLAN_VALUES}\)*\s+AND\s+\(*${PLAN_KEYS}\s*<=\s*${PLAN_VALUES}\)*$`,
  'u',
)
const SOURCE_KEYS = String.raw`\(topic_id,\s*post_id\)`
const SOURCE_VALUES = String.raw`\((\$\d+)::uuid,\s*(\$\d+)::uuid\)`

/** Match only the canonical topic interval, including both endpoint bindings in generic plans. */
export function validTopicViewerPrefixCondition(
  condition: string,
  input: { cte: string; relation: string },
  queryText: string,
): boolean {
  if (!condition.includes('ROW(')) return /\btopic_id\s*=/u.test(condition)
  const range = PLAN_RANGE.exec(condition)
  if (!range) return false
  const bounds = range.slice(1)
  if (bounds.every(value => value.startsWith('$'))) {
    // sql-template-strings gives repeated values separate parameter positions. Require the
    // plan to retain the exact lower/upper bindings of this input CTE, rather than any ROW pair.
    const source = new RegExp(
      String.raw`${input.cte}\s+AS\s+MATERIALIZED\s*\(\s*SELECT\s+post_id\s+FROM\s+${input.relation}\s+WHERE\s+${SOURCE_KEYS}\s*>=\s*${SOURCE_VALUES}\s+AND\s+${SOURCE_KEYS}\s*<=\s*${SOURCE_VALUES}\s+ORDER\s+BY\s+topic_id,\s*post_id\s+LIMIT\s+\$\d+\s*\)`,
      'u',
    ).exec(queryText)
    return source !== null && bounds.every((value, index) => value === source[index + 1])
  }
  return bounds[0] === bounds[2] && bounds[1] === `'${NIL}'::uuid` && bounds[3] === `'${MAX}'::uuid`
}
