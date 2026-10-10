import type { ExplainResult } from '@data-stores/psql'
import { baseRelationName, collectPlanNodes, processedRows } from '../plan-nodes.mts'
import { MEDIA_REPLAY_PAGE_SIZE } from '../seed-data/media-delivery-replay-cohort.mts'

const FAILED_INDEX = 'idx_media_delivery_registry_projection_work_items__failed'

/** Gate the driving candidates, then the scoped current-history and actor-event partners. */
export function assertMediaDeliveryReplayPlan(result: ExplainResult): void {
  const nodes = collectPlanNodes(result.plan)
  if (result.query_text.includes('replayFailedMediaDeliveryRegistryRecords:lock')) {
    const candidates = nodes.filter(node => node['Subplan Name'] === 'CTE candidates')
    if (
      candidates.length !== 1 ||
      candidates[0]?.['Node Type'] !== 'Limit' ||
      Number(candidates[0]['Actual Rows']) !== MEDIA_REPLAY_PAGE_SIZE ||
      collectPlanNodes(candidates[0]).some(node => String(node['Node Type']).includes('Sort'))
    )
      throw new Error(`${result.name} must materialize one full bounded UUID candidate page`)
    const scans = nodes.filter(
      node => baseRelationName(node) === 'media_delivery_registry_projection_work_items',
    )
    if (
      !scans.some(node => node['Index Name'] === FAILED_INDEX) ||
      scans.some(node => node['Node Type'] === 'Seq Scan') ||
      scans.reduce((sum, node) => sum + processedRows(node), 0) > MEDIA_REPLAY_PAGE_SIZE
    )
      throw new Error(`${result.name} must drive at most one page through ${FAILED_INDEX}`)
    return
  }
  if (!result.query_text.includes('ANY('))
    throw new Error(`${result.name} must constrain replay writes to the locked UUID array`)
  for (const relation of [
    'media_delivery_registry_records',
    'media_delivery_registry_changes',
    'copyright_notice_targets',
  ]) {
    // ModifyTable reports inserted output rows, not another read of its target relation.
    const scans = nodes.filter(
      node => baseRelationName(node) === relation && node['Node Type'] !== 'ModifyTable',
    )
    const budget =
      relation === 'media_delivery_registry_records'
        ? 2 * MEDIA_REPLAY_PAGE_SIZE
        : MEDIA_REPLAY_PAGE_SIZE
    if (
      scans.some(node => node['Node Type'] === 'Seq Scan' && processedRows(node) > budget) ||
      scans.reduce((sum, node) => sum + processedRows(node), 0) > budget
    )
      throw new Error(`${result.name} exceeded its scoped ${relation} driving-row budget`)
  }
}
