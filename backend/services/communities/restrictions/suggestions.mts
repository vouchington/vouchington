import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { RaidModeSuggestion } from './types.mts'

export async function getRaidModeSuggestion(communityId: string): Promise<RaidModeSuggestion> {
  const { rows } = await read(sql`/* getRaidModeSuggestion */
    SELECT
      COUNT(vif.id)::int AS flag_count,
      MAX(vif.created_at) AS latest_flagged_at
    FROM vote_integrity_flags vif
    JOIN posts p ON p.id = vif.post_id
    WHERE vif.flag_type = 'velocity_spike'
      AND vif.resolved_at IS NULL
      AND p.community_id = ${communityId}
      AND p.deleted_at IS NULL
  `)
  const row = rows[0] as { flag_count?: number; latest_flagged_at?: Date | null } | undefined
  const flagCount = row?.flag_count ?? 0
  return {
    velocity_spike: flagCount > 0,
    flag_count: flagCount,
    latest_flagged_at: row?.latest_flagged_at ?? null,
  }
}
