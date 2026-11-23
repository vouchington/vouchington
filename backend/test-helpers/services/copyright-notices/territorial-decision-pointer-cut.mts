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
    const scope = sql`/* setTerritorialDecisionPointerCutTestScope */
      SELECT set_config('app.copyright_case_purge_notice_id', ${noticeId}, true)`
    if (table !== null)
      scope.append(sql`, set_config('app.copyright_case_purge_table', ${table}, true)`)
    await query(scope)
    await query(sql`/* clearTerritorialDecisionPredecessorWithScope */
      UPDATE copyright_territorial_decisions SET supersedes_decision_id = NULL
      WHERE id = ${decisionId}
    `)
  })
}
