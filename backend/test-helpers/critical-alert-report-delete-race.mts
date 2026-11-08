import sql from 'sql-template-strings'
import { deleteForeignKeyTargetDuringInsertForTest } from './postgres-foreign-key-race.mts'

/** Deletes the owned report only after its notification insert reaches the real FK wait. */
export function deleteCriticalAlertReportDuringInsertForTest<Result>(
  reportId: string,
  operation: () => Promise<Result>,
) {
  return deleteForeignKeyTargetDuringInsertForTest({
    queryMarker: '/* insertCriticalAlertNotifications */',
    lockTarget: async query => {
      await query(sql`/* lockCriticalAlertReportDuringInsertForTest */
        SELECT id FROM moderation_reports WHERE id = ${reportId}::uuid FOR UPDATE`)
    },
    deleteTarget: async query => {
      await query(sql`/* deleteCriticalAlertReportDuringInsertForTest */
        DELETE FROM moderation_reports WHERE id = ${reportId}::uuid`)
    },
    operation,
  })
}
