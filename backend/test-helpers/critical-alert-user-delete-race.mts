import sql from 'sql-template-strings'
import { deleteForeignKeyTargetDuringInsertForTest } from './postgres-foreign-key-race.mts'
import { lockTestUserRowForUpdate } from './entities/users-mutation-locks.mts'

/** Witnesses the notification FK wait before committing the selected staff user's deletion. */
export function deleteCriticalAlertRecipientDuringInsertForTest<Result>(
  userId: string,
  operation: () => Promise<Result>,
) {
  return deleteForeignKeyTargetDuringInsertForTest({
    queryMarker: '/* insertCriticalAlertNotifications */',
    lockTarget: query => lockTestUserRowForUpdate(query, userId),
    deleteTarget: async query => {
      await query(sql`/* deleteCriticalAlertRecipientDuringInsertForTest */
        DELETE FROM users WHERE id = ${userId}::uuid`)
    },
    operation,
  })
}
