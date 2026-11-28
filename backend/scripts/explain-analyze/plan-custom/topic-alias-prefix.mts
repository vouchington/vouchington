import { collectPlanNodes, type ExplainResult, processedRows } from '@vouchington/explain-plan'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import { baseRelationName } from '../plan-nodes.mts'

const PREFIX_INDEX = 'idx_topic_aliases__alias__text_pattern_ops'

const CAPS_BY_SCENARIO: Readonly<
  Record<string, { readonly candidateCap: number; readonly hydrationCap: number }>
> = {
  // 11 seeded matches for 'seed-alias-199'; capped tightly so any full walk fails in both plan modes.
  'search-topic-aliases-selective-prefix': { candidateCap: 30, hydrationCap: 30 },
  // 2,500 seeded 'seed-alias-*' matches out of 4,026 total seeded topic_aliases; only 26 topics hydrate.
  'search-topic-aliases': { candidateCap: 2_600, hydrationCap: 40 },
  'search-topic-aliases-cursor': { candidateCap: 2_600, hydrationCap: 40 },
}

export function assertTopicAliasPrefixCandidates(result: ExplainResult): void {
  const caps = result.scenario_id ? CAPS_BY_SCENARIO[result.scenario_id] : undefined
  if (!caps) {
    throw new Error(
      `${result.name} has no topicAliasPrefixCandidates caps for scenario ${result.scenario_id ?? 'missing'}`,
    )
  }

  const nodes = collectPlanNodes(result.plan)
  const candidateIndex = nodes.find(node => node['Index Name'] === PREFIX_INDEX)
  const aliasAccesses = nodes.filter(node => baseRelationName(node) === 'topic_aliases')
  const topicAccesses = nodes.filter(node => baseRelationName(node) === 'topics')
  const aliasRows = aliasAccesses.reduce((total, node) => total + processedRows(node), 0)
  const topicRows = topicAccesses.reduce((total, node) => total + processedRows(node), 0)

  if (
    !candidateIndex ||
    !stringFromUnknown(candidateIndex['Index Cond'] ?? '').includes('~<~') ||
    processedRows(candidateIndex) > caps.candidateCap ||
    aliasAccesses.length === 0 ||
    aliasAccesses.some(node => node['Node Type'] === 'Seq Scan') ||
    aliasRows > caps.candidateCap ||
    topicAccesses.length === 0 ||
    topicAccesses.some(
      node => node['Node Type'] === 'Seq Scan' || node['Index Name'] !== 'topics_pkey',
    ) ||
    topicRows > caps.hydrationCap
  ) {
    throw new Error(
      `${result.name} must use ${PREFIX_INDEX} with ~<~ reading at most ${caps.candidateCap} alias candidates (read ${aliasRows}) and hydrate at most ${caps.hydrationCap} keyed topics via topics_pkey (read ${topicRows})`,
    )
  }
}
