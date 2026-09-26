import { beginTransaction } from '@data-stores/psql'
import { publicationPageLimit } from './page-limit.mts'
import {
  PUBLICATION_IDENTITY_BRIDGES,
  type PublicationIdentityBridgeFamily,
} from './identity-bridges.mts'

/** One concrete family and at most the raw candidate budget are examined per invocation. */
export async function cleanupPostPublicationIdentityBridges(limit = 100): Promise<{
  scanned: number
  deleted: number
  family: PublicationIdentityBridgeFamily
  candidates: string[]
}> {
  publicationPageLimit(limit)
  const budget = Math.min(limit, 100)
  await using query = await beginTransaction()
  const { rows: progress } = await query<{
    family: PublicationIdentityBridgeFamily
    cursor_identity_id: string | null
  }>(
    `/* lockPublicationIdentityBridgeCleanupProgress */ SELECT family, cursor_identity_id FROM post_publication_identity_bridge_cleanup_progress WHERE singleton FOR UPDATE`,
  )
  const { family, cursor_identity_id: cursor } = progress[0]!
  const { table, keyColumn, workColumn } = PUBLICATION_IDENTITY_BRIDGES[family]
  const { rows: candidates } = await query<{ id: string }>(
    `/* listPublicationIdentityBridgeCleanupCandidates */ SELECT id FROM ${table} ${cursor === null ? '' : 'WHERE id > $1::uuid'} ORDER BY id LIMIT ${budget}`,
    cursor === null ? [] : [cursor],
  )
  const references = [
    ...(keyColumn === null
      ? []
      : [
          `NOT EXISTS (SELECT 1 FROM post_publication_dirty_work_keys WHERE ${keyColumn} = locked.id)`,
        ]),
    ...(workColumn === null
      ? []
      : [`NOT EXISTS (SELECT 1 FROM post_publication_dirty_work WHERE ${workColumn} = locked.id)`]),
    ...(family === 'post'
      ? [
          'NOT EXISTS (SELECT 1 FROM post_publication_projection_receipts WHERE post_identity_id = locked.id)',
          'NOT EXISTS (SELECT 1 FROM post_publication_identity_snapshots WHERE post_identity_id = locked.id)',
        ]
      : []),
  ].join(' AND ')
  const { rowCount } = await query(
    `/* deleteUnreferencedPublicationIdentityBridgePage */
    WITH locked AS MATERIALIZED (
      SELECT bridge.id FROM unnest($1::uuid[]) candidate(id)
      CROSS JOIN LATERAL (SELECT id FROM ${table} WHERE id = candidate.id
        AND pg_try_advisory_xact_lock(hashtextextended('publication-identity:' || $2 || ':' || candidate.id::text, 0))
        LIMIT 1 FOR UPDATE SKIP LOCKED) bridge
    ) DELETE FROM ${table} target USING locked WHERE target.id = locked.id
      AND ${references}`,
    [candidates.map(row => row.id), family],
  )
  const families = Object.keys(PUBLICATION_IDENTITY_BRIDGES) as PublicationIdentityBridgeFamily[]
  const complete = candidates.length < budget
  await query(
    `/* checkpointPublicationIdentityBridgeCleanup */ UPDATE post_publication_identity_bridge_cleanup_progress SET family=$1, cursor_identity_id=$2, updated_at=CURRENT_TIMESTAMP WHERE singleton`,
    [
      complete ? families[(families.indexOf(family) + 1) % families.length] : family,
      complete ? null : candidates.at(-1)!.id,
    ],
  )
  await query.commit()
  return {
    scanned: candidates.length,
    deleted: rowCount ?? 0,
    family,
    candidates: candidates.map(row => row.id),
  }
}
