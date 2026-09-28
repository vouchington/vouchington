import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes } from './plan-nodes.mts'

const EMAIL_INDEX = 'idx_user_email_addresses_email_primary'

export function assertAdminEmailIndexPlan(result: ExplainResult): void {
  if (result.scenario_id !== 'search-admin-users-email') return
  if (!result.name.startsWith('searchAdminUsers:'))
    throw new Error(`${result.name} must capture the production admin search`)
  const nodes = collectPlanNodes(result.plan)
  const indexed = nodes.some(
    node =>
      node['Index Name'] === EMAIL_INDEX &&
      Number(node['Actual Loops'] ?? 0) > 0 &&
      String(node['Index Cond'] ?? '').includes('email_address'),
  )
  const broad = nodes.some(
    node =>
      node['Node Type'] === 'Seq Scan' &&
      node['Relation Name'] === 'user_email_addresses' &&
      Number(node['Actual Loops'] ?? 0) > 0,
  )
  if (!indexed || broad)
    throw new Error(`${result.name} must execute the selective primary-email index`)
}
