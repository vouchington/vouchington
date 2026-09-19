import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CopyrightActionIntentRecord } from './types.mts'

export async function selectCopyrightActionIntents(
  noticeId: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<CopyrightActionIntentRecord[]> {
  const { rows } =
    await query<CopyrightActionIntentRecord>(sql`/* getCopyrightNoticePrivateAggregate:actionIntents */
    SELECT i.* FROM copyright_notice_action_intents i
    JOIN copyright_restrictions r ON r.id = i.copyright_restriction_id
    JOIN copyright_notice_targets t ON t.id = r.copyright_notice_target_id
    WHERE t.copyright_notice_id = ${noticeId} ORDER BY i.id
  `)
  return rows
}
