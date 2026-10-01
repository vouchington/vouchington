import { beginTransaction } from '@data-stores/psql'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import sql from 'sql-template-strings'

export async function holdClassifierRunActorDeletionLock(actorId: string) {
  const transaction = await beginTransaction()
  await transaction(sql`/* holdClassifierRunActorDeletionAdvisory */
    SELECT fn_lock_active_user_for_mutation(${actorId}::uuid)
  `)
  return {
    processId: await getTestPostgresBackendProcessId(transaction),
    lockActorRow: async () => {
      await transaction(sql`/* holdClassifierRunActorDeletionRow */
        SET LOCAL lock_timeout = '250ms'
      `)
      await transaction(sql`/* holdClassifierRunActorDeletionRow */
        SELECT id FROM users WHERE id = ${actorId}::uuid FOR UPDATE
      `)
    },
    release: () => transaction.commit(),
  }
}
