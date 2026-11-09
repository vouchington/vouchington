import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  appealResolutionRunId,
  createAppealResolutionRun,
} from '../services/moderation-appeals/rerun-outcomes.mts'

/** Reserve a real appeal request generation for direct agent tests. */
export async function appealResolutionRunInputForTest(appealId: string, rerunById?: string) {
  const { rows } = rerunById
    ? await reserveManualRun(appealId)
    : await write<{ ai_draft_request_token: string }>(sql`
        /* appealResolutionRunInputForTest:automatic */
        SELECT ai_draft_request_token FROM moderation_appeals WHERE id = ${appealId}
      `)
  const requestToken = rows[0]?.ai_draft_request_token ?? crypto.randomUUID()
  return {
    appealId,
    requestToken,
    runId: appealResolutionRunId(requestToken),
    ...(rerunById ? { rerunById } : {}),
  }
}

async function reserveManualRun(appealId: string) {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ ai_draft_request_token: string }>(sql`
    /* appealResolutionRunInputForTest:rerun */
    UPDATE moderation_appeals SET ai_draft_request_token = uuidv7()
    WHERE id = ${appealId} RETURNING ai_draft_request_token
  `)
  if (rows[0]) {
    await createAppealResolutionRun(transaction, appealId, rows[0].ai_draft_request_token)
  }
  await transaction.commit()
  return { rows }
}
