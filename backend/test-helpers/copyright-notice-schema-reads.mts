import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CopyrightNoticeSchemaFixture } from './data-stores/psql/copyright-notice-schema-types.mts'

export async function countCopyrightActiveRestrictionsAtPlacement(
  fixture: CopyrightNoticeSchemaFixture,
): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`/* countCopyrightRestrictionsForPlacement */
    SELECT count(*)::integer AS count FROM copyright_restrictions restriction
    INNER JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE target.placement_id = (SELECT placement_id FROM copyright_notice_targets WHERE id = ${fixture.targetId})
      AND restriction.lifted_at IS NULL`)
  return rows[0]!.count
}

export async function readCopyrightActionIntentRevision(
  fixture: CopyrightNoticeSchemaFixture,
): Promise<number> {
  const { rows } = await read<{
    expected_placement_revision: number
  }>(sql`/* readCopyrightIntentRevision */
    SELECT expected_placement_revision FROM copyright_notice_action_work_items
    WHERE id = ${fixture.actionIntentId}`)
  return rows[0]!.expected_placement_revision
}
