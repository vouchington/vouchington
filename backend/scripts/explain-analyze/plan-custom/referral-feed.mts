import type { ExplainResult } from '@data-stores/psql'
import { processedRows, type PlanNode } from '../plan-nodes.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

const inspectionBounds: Readonly<Record<string, number>> = {
  'hostname-exclusion-referral-links': 250,
  'referral-feed-inspected-short': 20,
  'referral-feed-inspected-empty': 10,
  'referral-feed-inspected-after': 10,
  'referral-feed-inspected-limit100': 1000,
  'referral-feed-inspected-terminal': 10,
}

/** Count the raw driver, not matched rows or the keyed latest-link side probe. */
export function assertReferralFeedInspectedWalk(result: ExplainResult): void {
  const bound = inspectionBounds[result.scenario_id ?? '']
  if (bound === undefined) throw new Error(`Unknown referral feed walk: ${result.scenario_id}`)
  const drivers: { node: PlanNode; sorted: boolean }[] = []
  function visit(value: unknown, sorted = false): void {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return
    const node = value as PlanNode
    const hasSort = sorted || stringFromUnknown(node['Node Type'] ?? '').includes('Sort')
    if (node['Relation Name'] === 'user_referral_program_links' && node['Alias'] === 'urpl')
      drivers.push({ node, sorted: hasSort })
    if (Array.isArray(node['Plans'])) for (const child of node['Plans']) visit(child, hasSort)
    visit(node['Plan'], hasSort)
  }
  visit(result.plan)
  const driver = drivers[0]
  if (
    drivers.length !== 1 ||
    !driver ||
    driver.sorted ||
    driver.node['Index Name'] !== 'user_referral_program_links_pkey' ||
    driver.node['Scan Direction'] !== 'Backward' ||
    Number(driver.node['Actual Loops'] ?? 0) !== 1 ||
    processedRows(driver.node) > bound
  )
    throw new Error(
      `${result.name} must inspect at most ${bound} raw referral IDs in one backward primary-key walk without sorting`,
    )
  if (
    result.scenario_id !== 'hostname-exclusion-referral-links' &&
    !/\bid\s*</u.test(stringFromUnknown(driver.node['Index Cond'] ?? ''))
  )
    throw new Error(`${result.name} must put the inspected-tail cursor in the driver Index Cond`)
}
