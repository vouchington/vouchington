import { baseRelationName, collectPlanNodes, processedRows, type PlanNode } from '../plan-nodes.mts'

import { validTopicViewerPrefixCondition } from './topic-viewer-prefix-condition.mts'

const RAW_PREFIX_INPUTS = [
  { cte: 'viewer_review_inputs', relation: 'post_review_topic_ratings' },
  { cte: 'viewer_data_point_inputs', relation: 'post_data_point_topics' },
] as const

export function assertTopicViewerRawPrefixesBounded(
  name: string,
  nodes: readonly PlanNode[],
  inputCap: number,
  queryText = '',
): void {
  const unboundedPrefixes = RAW_PREFIX_INPUTS.filter(
    input =>
      !boundedRawPrefix(
        nodes.find(node => node['Subplan Name'] === `CTE ${input.cte}`),
        input.relation,
        inputCap,
        input.cte,
        queryText,
      ),
  )
  if (unboundedPrefixes.length > 0)
    throw new Error(
      `${name} must bound raw reads of topic viewer inputs: ${unboundedPrefixes.map(input => input.relation).join(', ')}`,
    )
}

function boundedRawPrefix(
  raw: PlanNode | undefined,
  relation: string,
  cap: number,
  cte: string,
  queryText: string,
): boolean {
  if (!raw || raw['Node Type'] !== 'Limit' || Number(raw['Actual Loops']) !== 1) return false
  if (typeof raw['Actual Rows'] !== 'number' || raw['Actual Rows'] > cap) return false
  const descendants = collectPlanNodes(raw).slice(1)
  if (descendants.some(node => baseRelationName(node) && baseRelationName(node) !== relation))
    return false
  const scans = descendants.filter(node => baseRelationName(node) === relation)
  if (scans.length === 0) return false
  for (const scan of scans) {
    if (
      typeof scan['Actual Rows'] !== 'number' ||
      typeof scan['Actual Loops'] !== 'number' ||
      !Number.isFinite(processedRows(scan))
    )
      return false
    if (scan['Node Type'] === 'Seq Scan') {
      if (typeof scan.Filter !== 'string' || !/\btopic_id\s*=/u.test(scan.Filter)) return false
    } else {
      const index = typeof scan['Index Name'] === 'string' ? scan['Index Name'] : ''
      // A post_id-first PK can hide rejected topic keys inside Index Cond. Accept only the
      // canonical topic-leading indexes, whose matching prefix is visible in Actual Rows.
      const topicLeading =
        index === `idx_${relation}__topic_id` ||
        (index.startsWith(`${relation}__`) && index.includes('_topic_id_post_id'))
      if (
        !['Index Scan', 'Index Only Scan'].includes(String(scan['Node Type'])) ||
        !topicLeading ||
        typeof scan['Index Cond'] !== 'string' ||
        !validTopicViewerPrefixCondition(scan['Index Cond'], { cte, relation }, queryText)
      )
        return false
    }
  }
  if (
    descendants.some(
      node =>
        !['Index Scan', 'Index Only Scan', 'Seq Scan', 'Append', 'Merge Append'].includes(
          String(node['Node Type']),
        ),
    )
  )
    return false
  // Bound physical work to a fixed multiple of the input cap, including discarded tuples
  // and every scan invocation across partitions, independently of the outer LIMIT output.
  return scans.reduce((total, scan) => total + processedRows(scan), 0) <= 2 * cap + 1
}
