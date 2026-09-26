import type { QueryExecutor } from '@data-stores/psql'
import {
  classifierDecisionCandidateKind,
  classifierResultEntityId,
  flattenClassifierDecisionResults,
  serializeClassifierRawResponse,
  type NormalizedClassifierDecisionInput,
} from './decision-input.mts'
import type { ClassifierDecisionSnapshot } from './write-decision-lineage.mts'
import type { ClassifierDecisionInputResult, PersistedClassifierDecisionCall } from './types.mts'
import {
  buildRssFeedItemInsert,
  buildStoryInsert,
  buildTopicInsert,
  type PersistedInputRow,
} from './write-decision-results-queries.mts'

export async function insertClassifierDecisionResults(
  query: QueryExecutor,
  input: NormalizedClassifierDecisionInput,
  calls: readonly PersistedClassifierDecisionCall[],
  snapshots: ReadonlyMap<string, ClassifierDecisionSnapshot>,
  promptThresholds: { lower: number; upper: number },
): Promise<number> {
  const callIdsByOrdinal = new Map(calls.map(call => [call.shardOrdinal, call.id]))
  const rows = input.calls.flatMap(call =>
    call.results.map(result => ({
      result,
      row: toPersistedInputRow(
        result,
        callIdsByOrdinal.get(call.shardOrdinal),
        snapshots,
        promptThresholds,
      ),
    })),
  )
  if (rows.some(({ row }) => !row.decisionCallId)) {
    throw new Error('Classifier decision call is missing its persisted shard')
  }
  if (classifierDecisionCandidateKind(input) === 'topic') {
    return insertTopicResults(
      query,
      input,
      rows.map(({ row }) => row),
    )
  }
  const storyRows: PersistedInputRow[] = []
  const rssFeedItemRows: PersistedInputRow[] = []
  for (const { result, row } of rows) {
    if (result.candidateKind === 'story') storyRows.push(row)
    else if (result.candidateKind === 'rss_feed_item') rssFeedItemRows.push(row)
  }
  const [storyCount, rssFeedItemCount] = await Promise.all([
    storyRows.length > 0 ? insertStoryResults(query, input, storyRows) : Promise.resolve(0),
    rssFeedItemRows.length > 0
      ? insertRssFeedItemResults(query, input, rssFeedItemRows)
      : Promise.resolve(0),
  ])
  return storyCount + rssFeedItemCount
}

function toPersistedInputRow(
  result: ClassifierDecisionInputResult,
  decisionCallId: string | undefined,
  snapshots: ReadonlyMap<string, ClassifierDecisionSnapshot>,
  promptThresholds: { lower: number; upper: number },
): PersistedInputRow {
  const snapshot = result.storedCandidateId ? snapshots.get(result.storedCandidateId) : undefined
  return {
    candidateId: result.storedCandidateId,
    decisionCallId,
    entityId: classifierResultEntityId(result),
    probability: result.probability,
    rawResponse: serializeClassifierRawResponse(result.rawResponse),
    thresholdId: snapshot?.threshold_id ?? null,
    lowerThreshold: snapshot?.effective_lower_threshold ?? promptThresholds.lower,
    upperThreshold: snapshot?.effective_upper_threshold ?? promptThresholds.upper,
  }
}

async function insertTopicResults(
  query: QueryExecutor,
  input: NormalizedClassifierDecisionInput,
  rows: readonly PersistedInputRow[],
): Promise<number> {
  const { rowCount } = await query(buildTopicInsert(input, rows))
  return rowCount ?? 0
}

async function insertStoryResults(
  query: QueryExecutor,
  input: NormalizedClassifierDecisionInput,
  rows: readonly PersistedInputRow[],
): Promise<number> {
  const { rowCount } = await query(buildStoryInsert(input, rows))
  return rowCount ?? 0
}

async function insertRssFeedItemResults(
  query: QueryExecutor,
  input: NormalizedClassifierDecisionInput,
  rows: readonly PersistedInputRow[],
): Promise<number> {
  const { rowCount } = await query(buildRssFeedItemInsert(input, rows))
  return rowCount ?? 0
}

export function expectedClassifierDecisionResultCount(
  input: NormalizedClassifierDecisionInput,
): number {
  return flattenClassifierDecisionResults(input).length
}
