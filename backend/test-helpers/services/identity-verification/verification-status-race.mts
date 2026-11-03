import sql from 'sql-template-strings'
import { runBeforePostgresStatementForTest } from '../../injected-failures.mts'

/** Simulate a lifecycle transition between the verification guard and final update on real PG. */
export function loseVerificationStatusBeforeFinalUpdateForTest(userId: string): () => void {
  return runBeforePostgresStatementForTest(
    'onVerificationSessionVerified:update',
    async transaction => {
      await transaction(sql`/* loseVerificationStatusBeforeFinalUpdateForTest */
        UPDATE users SET verification_status = 'failed', pending_verification_session_id = NULL
        WHERE id = ${userId}
      `)
    },
  )
}
