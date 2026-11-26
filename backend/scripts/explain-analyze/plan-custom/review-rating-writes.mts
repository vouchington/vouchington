import { collectPlanNodes, type ExplainResult } from '@vouchington/explain-plan'

export function assertReviewRatingWriteBufferBound(result: ExplainResult): void {
  const [root] = collectPlanNodes(result.plan)
  const hits = root?.['Shared Hit Blocks']
  const reads = root?.['Shared Read Blocks']
  if (
    root?.['Node Type'] !== 'ModifyTable' ||
    root['Relation Name'] !== 'post_review_topic_ratings' ||
    typeof hits !== 'number' ||
    typeof reads !== 'number'
  )
    throw new Error(`${result.name} must report shared buffers for the ratings insert`)

  // Include BEFORE trigger work. Replanning the guard for every rating exceeded this budget
  // on both forced-custom passes at the cap (#6401).
  if (hits + reads > 2_000)
    throw new Error(`${result.name} accessed ${hits + reads} shared buffers; expected at most 2000`)
}
