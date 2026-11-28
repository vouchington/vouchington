import { collectPlanNodes, type ExplainResult, processedRows } from '@vouchington/explain-plan'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import { baseRelationName } from '../plan-nodes.mts'

const PREFIX_INDEX = 'idx_topic_aliases__alias_c'
const LOWER_BOUND_PATTERN = /\b(?:topic_aliases\.)?alias\)?(?:::text)?\s*>=/
const UPPER_BOUND_PATTERN = /\b(?:topic_aliases\.)?alias\)?(?:::text)?\s*</
const CURSOR_BOUND_PATTERN = /\b(?:topic_aliases\.)?alias\)?(?:::text)?\s*>\s*(?!=)/

const CAPS_BY_SCENARIO: Readonly<
  Record<
    string,
    {
      readonly candidateCap: number
      readonly hydrationCap: number
      readonly requireCursor?: boolean
    }
  >
> = {
  // 11 seeded matches for 'seed-alias-199'; capped tightly so any full walk fails in both plan modes.
  'search-topic-aliases-selective-prefix': { candidateCap: 30, hydrationCap: 30 },
  // Ordered byte-collation index scan stops after one page (26 rows); capped near old ~110 + slack.
  'search-topic-aliases': { candidateCap: 120, hydrationCap: 40 },
  'search-topic-aliases-cursor': { candidateCap: 120, hydrationCap: 40, requireCursor: true },
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
  const indexCond = stringFromUnknown(candidateIndex?.['Index Cond'] ?? '')
  const hasSort = nodes.some(
    node => node['Node Type'] === 'Sort' || node['Node Type'] === 'Incremental Sort',
  )
  const aliasAccesses = nodes.filter(node => baseRelationName(node) === 'topic_aliases')
  const topicAccesses = nodes.filter(node => baseRelationName(node) === 'topics')
  const aliasRows = aliasAccesses.reduce((total, node) => total + processedRows(node), 0)
  const topicRows = topicAccesses.reduce((total, node) => total + processedRows(node), 0)

  if (
    !candidateIndex ||
    baseRelationName(candidateIndex) !== 'topic_aliases' ||
    !LOWER_BOUND_PATTERN.test(indexCond) ||
    !UPPER_BOUND_PATTERN.test(indexCond) ||
    (caps.requireCursor && !CURSOR_BOUND_PATTERN.test(indexCond)) ||
    hasSort ||
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
      `${result.name} must use an ordered ${PREFIX_INDEX} scan with >= and < bounds${caps.requireCursor ? ' and > cursor' : ''} and no Sort, reading at most ${caps.candidateCap} alias rows (read ${aliasRows}) and hydrating at most ${caps.hydrationCap} keyed topics via topics_pkey (read ${topicRows})`,
    )
  }
}
