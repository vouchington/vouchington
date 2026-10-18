import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Reserve a real appeal request generation for direct agent tests. */
export async function appealResolutionRunInputForTest(appealId: string, rerunById?: string) {
  const statement = rerunById
    ? sql`/* appealResolutionRunInputForTest:rerun */
        UPDATE moderation_appeals SET ai_draft_request_token = uuidv7()
        WHERE id = ${appealId} RETURNING ai_draft_request_token`
    : sql`/* appealResolutionRunInputForTest:automatic */
        SELECT ai_draft_request_token FROM moderation_appeals WHERE id = ${appealId}`
  const { rows } = await write<{ ai_draft_request_token: string }>(statement)
  const requestToken = rows[0]?.ai_draft_request_token ?? crypto.randomUUID()
  return {
    appealId,
    requestToken,
    runId: `appeal_resolution_${requestToken}`,
    ...(rerunById ? { rerunById } : {}),
  }
}
