import { describe, expect, it } from 'vitest'
import type { OwnedTransaction } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import type { SQLStatement } from 'sql-template-strings'
import { sweepClassifierChildPageWithQuery } from '../cleanup-classifier-children.mts'

const lowerBoundId = getMinUUIDv7ForDate(new Date('2020-01-01T00:00:00.000Z'))
const cutoffId = getMinUUIDv7ForDate(new Date('2020-02-01T00:00:00.000Z'))
const runId = getMinUUIDv7ForDate(new Date('2020-01-02T00:00:00.000Z'))
const nextRunId = getMinUUIDv7ForDate(new Date('2020-01-03T00:00:00.000Z'))
const topicId = '00000000-0000-4000-8000-000000000001'

type Progress = {
  cursor_id: string | null
  cursor_ordinal: number | null
  cursor_child_id: string | null
  sweep_end_key: string | null
}

function capturePage(progress: Progress, pageRows: Record<string, unknown>[], deleted: number) {
  const statements: SQLStatement[] = []
  const query = (async (statement: SQLStatement) => {
    statements.push(statement)
    if (statement.text.includes('lockClassifierChildCursor')) return { rows: [progress] }
    if (statement.text.includes('listClassifier')) return { rows: pageRows }
    if (statement.text.includes('deleteTerminal')) return { rowCount: deleted, rows: [] }
    return { rows: [], rowCount: 0 }
  }) as unknown as OwnedTransaction
  return { query, statements }
}

function statementFor(statements: SQLStatement[], marker: string): SQLStatement {
  const statement = statements.find(item => item.text.includes(marker))
  expect(statement).toBeDefined()
  return statement!
}

describe('classifier child raw-page retention', () => {
  it('advances the run-candidate composite cursor even when only one of two raw keys is deleted', async () => {
    const capture = capturePage(
      { cursor_id: null, cursor_ordinal: null, cursor_child_id: null, sweep_end_key: null },
      [
        { run_id: runId, ordinal: 1 },
        { run_id: nextRunId, ordinal: 2 },
      ],
      1,
    )
    const result = await sweepClassifierChildPageWithQuery(
      capture.query,
      'run_candidates',
      cutoffId,
      lowerBoundId,
      1,
    )
    expect(result).toEqual({ scanned: 1, deleted: 1, hasMore: true })
    const page = statementFor(capture.statements, 'listClassifierRunCandidatePage')
    expect(page.values.at(-1)).toBe(2)
    const checkpoint = statementFor(capture.statements, 'checkpointClassifierChildCursor')
    expect(checkpoint.values).toContain(runId)
    expect(checkpoint.values).toContain(1)
    expect(checkpoint.values).toContain(cutoffId)
    expect(statementFor(capture.statements, 'deleteTerminalRunCandidates').text).toContain(
      'run.completed_at IS NOT NULL',
    )
  })

  it('resumes after the saved agent-topic child key and clears progress at the end', async () => {
    const capture = capturePage(
      {
        cursor_id: runId,
        cursor_ordinal: null,
        cursor_child_id: topicId,
        sweep_end_key: cutoffId,
      },
      [{ run_id: nextRunId, topic_id: topicId }],
      1,
    )
    const result = await sweepClassifierChildPageWithQuery(
      capture.query,
      'agent_topics',
      cutoffId,
      lowerBoundId,
      1,
    )
    expect(result).toEqual({ scanned: 1, deleted: 1, hasMore: false })
    const page = statementFor(capture.statements, 'listClassifierAgentTopicPage')
    expect(page.text).toContain('(run_id, topic_id) >')
    expect(page.values).toContain(topicId)
    expect(statementFor(capture.statements, 'deleteTerminalAgentTopics').text).toContain(
      'run.terminal_failed_at IS NOT NULL',
    )
    expect(statementFor(capture.statements, 'checkpointClassifierChildCursor').values).toContain(
      null,
    )
  })

  it('uses the saved local-outcome run key and deletes only terminal rows', async () => {
    const capture = capturePage(
      { cursor_id: runId, cursor_ordinal: null, cursor_child_id: null, sweep_end_key: cutoffId },
      [{ run_id: nextRunId }],
      0,
    )
    const result = await sweepClassifierChildPageWithQuery(
      capture.query,
      'local_outcomes',
      cutoffId,
      lowerBoundId,
      1,
    )
    expect(result).toEqual({ scanned: 1, deleted: 0, hasMore: false })
    expect(statementFor(capture.statements, 'listClassifierLocalOutcomePage').text).toContain(
      'run_id >',
    )
    expect(statementFor(capture.statements, 'deleteTerminalLocalOutcomes').text).toContain(
      'run.superseded_at IS NOT NULL',
    )
  })
})
