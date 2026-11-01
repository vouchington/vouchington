import type { TransactionQuery } from '@data-stores/psql/types'
import type { CopyrightCasePurgeJobData } from '../../queues/psql/types.mts'
import sql from 'sql-template-strings'
import { COPYRIGHT_CASE_PURGE_PHASES } from './retention-case-purge-order.mts'
import { COPYRIGHT_CASE_CHILD_BLOCKERS } from './retention-case-purge-blockers.mts'
import {
  afterClause,
  ascend,
  childPredicate,
  equality,
  identifier,
  parentValues,
  type Frame,
  type Phase,
} from './retention-case-purge-child-path.mts'

export const COPYRIGHT_CASE_CHILD_PHASE_COUNT = COPYRIGHT_CASE_PURGE_PHASES.length
type ChildPage = {
  processed: number
  nextPhaseIndex: number
  childFrames: Frame[]
  blocked: boolean
}

/** One indexed ancestor lookup per path level and at most one bounded leaf DELETE. */
async function runCopyrightCaseChildPage(
  query: TransactionQuery,
  noticeId: string,
  phaseIndex: number,
  inputFrames: CopyrightCasePurgeJobData['childFrames'],
  limit: number,
  verifyOnly: boolean,
): Promise<ChildPage> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Invalid copyright child page size')
  const phase = COPYRIGHT_CASE_PURGE_PHASES[phaseIndex] as Phase | undefined
  if (!phase) return { processed: 0, nextPhaseIndex: phaseIndex, childFrames: [], blocked: false }
  const path = phase[1]
  const frames: Frame[] = inputFrames?.length
    ? inputFrames.map(frame => ({
        values: { ...frame.values },
        after: frame.after ? { ...frame.after } : null,
      }))
    : [{ values: { id: noticeId }, after: null }]
  if (frames.length < 1 || frames.length > path.length || frames[0]?.values.id !== noticeId)
    throw new Error('Invalid copyright purge child path')

  if (!verifyOnly)
    await query(sql`/* scopeCopyrightCasePurgeChildPage */
      SELECT set_config('app.copyright_case_purge_notice_id', ${noticeId}, true),
        set_config('app.copyright_case_purge_table', ${phase[0]}, true)`)

  while (frames.length < path.length) {
    const parent = frames.at(-1)!
    const edge = path[frames.length - 1]!
    const values = parentValues(edge, parent)
    const after = afterClause(edge[5], parent.after, values.length + 1)
    const selected = edge[4].map(identifier).join(', ')
    const where = equality(edge[1], 1).join(' AND ')
    const order = edge[5].map(identifier).join(', ')
    // no-mistakes-disable-next-line query-reached-per-item: path depth is a fixed schema-derived maximum of five, and each ancestor lookup is indexed LIMIT 1.
    const { rows } = await query<Record<string, string | number>>( // oxlint-disable-line no-await-in-loop -- each indexed ancestor key supplies the next bounded path lookup.
      `/* selectCopyrightCasePurgeAncestor */ SELECT ${selected} FROM ${identifier(edge[0])} child
       WHERE ${where}${after.clause} ORDER BY ${order} LIMIT 1 FOR UPDATE OF child NOWAIT`,
      [...values, ...after.values],
    )
    if (!rows[0]) {
      const finished = ascend(frames, path)
      return {
        processed: 0,
        nextPhaseIndex: phaseIndex + Number(finished),
        childFrames: finished ? [] : frames,
        blocked: false,
      }
    }
    frames.push({ values: rows[0], after: null })
  }

  const parent = frames.at(-1)!
  const edge = path.at(-1)!
  const values = parentValues(edge, parent)
  const after = afterClause(edge[5], parent.after, values.length + 1)
  const where = equality(edge[1], 1).join(' AND ')
  const keyColumns = edge[3].map(identifier)
  const cursorColumns = edge[5].map(identifier)
  const candidates = [...new Set([...keyColumns, ...cursorColumns])]
    .map(column => `child.${column}`)
    .join(', ')
  const join = keyColumns.map(column => `child.${column} = page.${column}`).join(' AND ')
  const order = cursorColumns.join(', ')
  const reverseOrder = cursorColumns.map(column => `${column} DESC`).join(', ')
  const blocker = COPYRIGHT_CASE_CHILD_BLOCKERS[phase[0]] ?? 'false'
  const statement = verifyOnly
    ? `/* verifyCopyrightCaseChildPage */
    WITH page AS MATERIALIZED (
      SELECT ${candidates} FROM ${identifier(edge[0])} child
      WHERE ${where}${after.clause}
      ORDER BY ${order} LIMIT $${values.length + after.values.length + 1}
    ), checked AS MATERIALIZED (
      SELECT (${blocker}) AS blocked FROM ${identifier(edge[0])} child
      JOIN page ON ${join}
    ) SELECT (SELECT count(*)::integer FROM page) AS processed,
      COALESCE((SELECT bool_or(blocked) FROM checked), false) AS blocked,
      (SELECT row_to_json(last_row) FROM (
        SELECT ${cursorColumns.join(', ')} FROM page ORDER BY ${reverseOrder} LIMIT 1
      ) last_row) AS last_key`
    : `/* deleteCopyrightCaseChildPage */
    WITH candidates AS MATERIALIZED (
      SELECT ${candidates} FROM ${identifier(edge[0])} child
      WHERE ${where}${after.clause}${childPredicate(phase)}
      ORDER BY ${order} LIMIT $${values.length + after.values.length + 1}
      FOR UPDATE OF child
    ), deleted AS (
      DELETE FROM ${identifier(edge[0])} child USING candidates page
      WHERE ${join} RETURNING 1
    ) SELECT (SELECT count(*)::integer FROM deleted) AS processed,
      false AS blocked,
      (SELECT row_to_json(last_row) FROM (
        SELECT ${cursorColumns.join(', ')} FROM candidates ORDER BY ${reverseOrder} LIMIT 1
      ) last_row) AS last_key`
  const { rows } = await query<{
    processed: number
    blocked: boolean
    last_key: Record<string, string | number> | null
  }>(statement, [...values, ...after.values, limit])
  const processed = rows[0]?.processed ?? 0
  if (processed === limit) {
    const lastKey = rows[0]?.last_key
    if (!lastKey) throw new Error('Missing copyright child page cursor')
    parent.after = lastKey
  }
  const finished = processed < limit && ascend(frames, path)
  return {
    processed,
    nextPhaseIndex: phaseIndex + Number(finished),
    childFrames: finished ? [] : frames,
    blocked: rows[0]?.blocked ?? false,
  }
}

export async function deleteCopyrightCaseChildPage(
  query: TransactionQuery,
  noticeId: string,
  phaseIndex: number,
  frames: CopyrightCasePurgeJobData['childFrames'],
  limit: number,
) {
  const page = await runCopyrightCaseChildPage(query, noticeId, phaseIndex, frames, limit, false)
  return {
    deleted: page.processed,
    nextPhaseIndex: page.nextPhaseIndex,
    childFrames: page.childFrames,
  }
}

export function verifyCopyrightCaseChildPage(
  query: TransactionQuery,
  noticeId: string,
  phaseIndex: number,
  frames: CopyrightCasePurgeJobData['childFrames'],
  limit: number,
) {
  return runCopyrightCaseChildPage(query, noticeId, phaseIndex, frames, limit, true)
}
