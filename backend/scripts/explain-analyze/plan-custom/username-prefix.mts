import type { ExplainResult } from '@data-stores/psql'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import { baseRelationName, collectPlanNodes, processedRows } from '../plan-nodes.mts'

export function assertUsernamePrefixCandidates(result: ExplainResult): void {
  const nodes = collectPlanNodes(result.plan)
  const candidateCap =
    result.scenario_id === 'search-users'
      ? 24_002
      : result.scenario_id === 'search-users-selective'
        ? 2
        : 0
  const hydrationCap =
    result.scenario_id === 'search-users'
      ? 52
      : result.scenario_id === 'search-users-selective'
        ? 2
        : 0
  const candidateIndex = nodes.find(
    node => node['Index Name'] === 'idx_users__username__text_pattern_ops',
  )
  const usersAccesses = nodes.filter(node => baseRelationName(node) === 'users')
  const candidateScan = usersAccesses.find(node => node['Alias'] === 'users')
  const hydrated = usersAccesses.filter(node => node !== candidateScan)
  if (
    !candidateIndex ||
    processedRows(candidateIndex) > candidateCap ||
    !candidateScan ||
    processedRows(candidateScan) > candidateCap ||
    usersAccesses.some(node => node['Node Type'] === 'Seq Scan') ||
    !stringFromUnknown(candidateIndex['Index Cond'] ?? '').includes('~<~') ||
    hydrated.reduce((total, node) => total + processedRows(node), 0) > hydrationCap ||
    hydrated.some(node => node['Index Name'] !== 'users_pkey')
  )
    throw new Error(
      `${result.name} must read at most ${candidateCap} indexed prefix candidates and hydrate at most ${hydrationCap} keyed users`,
    )
}
