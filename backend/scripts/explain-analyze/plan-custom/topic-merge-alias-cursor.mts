import { collectPlanNodes, type ExplainResult } from '@vouchington/explain-plan'

export function assertTopicMergeAliasCursorSeek(result: ExplainResult): void {
  if (result.capture_index !== 0) return
  const hasCursorSeek = collectPlanNodes(result.plan).some(
    node =>
      node['Index Name'] === 'idx_topic_aliases__topic_id' &&
      typeof node['Index Cond'] === 'string' &&
      /\btopic_id\s*=/.test(node['Index Cond']) &&
      /\balias\s*>\s/.test(node['Index Cond']),
  )
  if (!hasCursorSeek)
    throw new Error(
      `${result.name} must use topic_id and alias > cursor in the alias index condition`,
    )
}
