import type { PoolClient } from '@data-stores/psql'

export async function readReplicaSourceVersionFromClient(
  client: PoolClient,
  sourceId: string,
): Promise<string | null> {
  const { rows } = await client.query<{ version: string }>(
    `/* copyFreshSourceMembership:replicaVersion */
     SELECT xmin::text AS version
     FROM domain_blocklist_sources
     WHERE id = $1::bigint`,
    [sourceId],
  )
  return rows[0]?.version ?? null
}
