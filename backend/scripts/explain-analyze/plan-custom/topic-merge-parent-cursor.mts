import { collectPlanNodes, type ExplainResult } from '@vouchington/explain-plan'

export function assertTopicMergeParentCursorSeek(result: ExplainResult): void {
  if (result.capture_index !== 1) return
  const hasCursorSeek = collectPlanNodes(result.plan).some(
    node =>
      node['Index Name'] === 'relation__topic__parent__topic_pkey' &&
      typeof node['Index Cond'] === 'string' &&
      /\bsubject_id\s*=/.test(node['Index Cond']) &&
      (/ROW\(subject_id,\s*object_id\)\s*>\s*ROW\(/.test(node['Index Cond']) ||
        /\bobject_id\s*>\s*/.test(node['Index Cond'])) &&
      typeof node.Filter !== 'string',
  )
  if (!hasCursorSeek)
    throw new Error(
      `${result.name} must seek subject_id and object_id > cursor in relation__topic__parent__topic_pkey without a residual filter`,
    )
}
