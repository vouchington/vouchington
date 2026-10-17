import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes } from '../plan-nodes.mts'

/** Relocated original unit plan obligations, with the original realistic fixture scale. */
export function assertDispatchWorkPlan(
  kind: 'urls' | 'crawl' | 'unfurl',
  result: ExplainResult,
): void {
  const nodes = collectPlanNodes(result.plan)
  const relation = kind === 'urls' ? 'urls' : 'user_referral_program_links'
  const scans = nodes.filter(node => node['Relation Name'] === relation)
  if (scans.length === 0 || scans.some(node => node['Node Type'] === 'Seq Scan'))
    throw new Error(`${result.name} must retain indexed ${relation} access`)
  const indexes = nodes.map(node => node['Index Name'])
  if (kind === 'urls') {
    if (!indexes.some(index => typeof index === 'string' && index.includes('urls')))
      throw new Error('Missing URL index probe')
  } else if (kind === 'crawl') {
    if (!indexes.includes('idx_user_referral_program_links__crawl_due'))
      throw new Error('Missing due-crawl index')
    if (scans.reduce((n, node) => n + Number(node['Actual Rows'] ?? 0), 0) > 2)
      throw new Error('Due page exceeds two candidates before retry filtering')
  } else {
    if (!indexes.includes('idx_user_referral_program_links__unfurl_requested'))
      throw new Error('Missing pending-timestamp index')
    if (scans.reduce((n, node) => n + Number(node['Rows Removed by Filter'] ?? 0), 0) > 1)
      throw new Error('Pending-unfurl scan filtered unrelated later work')
  }
}
