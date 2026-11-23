import { beginBoundedTransaction, withTransactionOptions, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { lockCopyrightActionGenerationForWrite } from '../../../services/copyright-notices/action-delivery-generation.mts'
import { cutCopyrightCasePointerPage } from '../../../services/copyright-notices/retention-case-purge-pointers.mts'

export async function readTerritorialDecisionPredecessors(noticeId: string) {
  const { rows } = await write<{ id: string; supersedes_decision_id: string | null }>(sql`
    /* readTerritorialDecisionPredecessors */
    SELECT id, supersedes_decision_id FROM copyright_territorial_decisions
    WHERE copyright_notice_id = ${noticeId} ORDER BY id
  `)
  return rows
}

export async function runTerritorialDecisionPointerCut(noticeId: string) {
  await using query = await beginBoundedTransaction({
    isolationLevel: 'serializable',
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 20_000,
  })
  await lockCopyrightActionGenerationForWrite(noticeId, query)
  const result = await cutCopyrightCasePointerPage(query, noticeId, 0, 20, null)
  await query.commit()
  return result
}

export async function clearTerritorialDecisionPredecessorWithScope(
  decisionId: string,
  noticeId: string,
  table: string | null,
) {
  return withTransactionOptions({}, async query => {
    await query(territorialPurgeScope(noticeId, table))
    await query(sql`/* clearTerritorialDecisionPredecessorWithScope */
      UPDATE copyright_territorial_decisions SET supersedes_decision_id = NULL
      WHERE id = ${decisionId}
    `)
  })
}

export async function readTerritorialPurgeDecisionPartitions(
  decisionId: string,
  redressId: string,
) {
  const { rows } = await write<{ decision: string | null; redress: string | null }>(sql`
    /* readTerritorialPurgeDecisionPartitions */
    SELECT
      (SELECT tableoid::regclass::text FROM copyright_territorial_decisions
        WHERE id = ${decisionId}) AS decision,
      (SELECT tableoid::regclass::text FROM copyright_territorial_redress_decisions
        WHERE id = ${redressId}) AS redress
  `)
  return rows[0]!
}

export async function deleteTerritorialDecisionWithScope(
  target: 'decision' | 'redress',
  decisionId: string,
  noticeId: string | null,
  table: string | null,
) {
  await withTransactionOptions({}, async query => {
    await query(territorialPurgeScope(noticeId, table))
    await query(
      target === 'decision'
        ? sql`/* deleteTerritorialDecisionWithScope */
            DELETE FROM copyright_territorial_decisions WHERE id = ${decisionId}`
        : sql`/* deleteTerritorialRedressDecisionWithScope */
            DELETE FROM copyright_territorial_redress_decisions WHERE id = ${decisionId}`,
    )
  })
}

function territorialPurgeScope(noticeId: string | null, table: string | null) {
  if (noticeId === null) {
    return sql`/* setTerritorialCasePurgeTestTable */
      SELECT set_config('app.copyright_case_purge_table', ${table}, true)`
  }
  const scope = sql`/* setTerritorialCasePurgeTestScope */
    SELECT set_config('app.copyright_case_purge_notice_id', ${noticeId}, true)`
  if (table !== null)
    scope.append(sql`, set_config('app.copyright_case_purge_table', ${table}, true)`)
  return scope
}
