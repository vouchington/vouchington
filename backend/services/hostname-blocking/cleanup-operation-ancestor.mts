import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

export type PendingAncestorCleanupRoot = {
  id: string
  stage: 'subdomains' | 'relations' | 'penalties'
  penalizeCreators: boolean
}

export async function lockPendingAncestorHostnameBlockCleanup(
  query: TransactionQuery,
  hostname: string,
): Promise<PendingAncestorCleanupRoot | null> {
  const labels = hostname.split('.')
  const ancestors = labels.slice(1).map((_, index) => labels.slice(index + 1).join('.'))
  if (ancestors.length === 0) return null

  const { rows } =
    await query<PendingAncestorCleanupRoot>(sql`/* lockPendingAncestorHostnameBlockCleanup */
    SELECT root.id, root.relation_cleanup_stage AS stage,
      root.should_penalize_relation_creators AS "penalizeCreators"
    FROM url_hostname_blocks root
    WHERE root.id = (
      SELECT candidate.id FROM url_hostnames ancestor
      CROSS JOIN LATERAL (
        SELECT pending.id FROM url_hostname_blocks pending
        WHERE pending.url_hostname_id = ancestor.id
          AND pending.lifted_at IS NULL AND pending.domain_blocklist_source_id IS NULL
          AND pending.relation_cleanup_root_block_id = pending.id
          AND pending.relation_cleanup_completed_at IS NULL
        ORDER BY pending.id LIMIT 1
      ) candidate
      WHERE ancestor.hostname = ANY(${ancestors}::text[])
      ORDER BY cardinality(string_to_array(ancestor.hostname, '.')) DESC, candidate.id
      LIMIT 1
    )
      AND root.lifted_at IS NULL AND root.domain_blocklist_source_id IS NULL
      AND root.relation_cleanup_root_block_id = root.id
      AND root.relation_cleanup_completed_at IS NULL
    FOR UPDATE OF root
  `)
  return rows[0] ?? null
}

export async function getPendingDescendantCleanupRootHostnames(
  query: TransactionQuery,
  blockId: string,
  candidateReversedHostnames: string[],
): Promise<Set<string>> {
  const ancestorReversedHostnames = [
    ...new Set(
      candidateReversedHostnames.flatMap(candidate =>
        candidate.split('.').map((_, index, labels) => labels.slice(0, index + 1).join('.')),
      ),
    ),
  ]
  if (ancestorReversedHostnames.length === 0) return new Set()
  const ancestorHostnames = ancestorReversedHostnames.map(hostname =>
    hostname.split('.').toReversed().join('.'),
  )

  const { rows } = await query<{ reversed_hostname: string }>(
    sql`/* getPendingDescendantCleanupRootHostnames */
      SELECT ancestor.reversed_hostname FROM url_hostnames ancestor
      CROSS JOIN LATERAL (
        SELECT 1 FROM url_hostname_blocks root
        WHERE root.url_hostname_id = ancestor.id AND root.id <> ${blockId}
          AND root.lifted_at IS NULL AND root.domain_blocklist_source_id IS NULL
          AND root.relation_cleanup_root_block_id = root.id
          AND root.relation_cleanup_completed_at IS NULL
        LIMIT 1
      ) pending_root
      WHERE ancestor.hostname = ANY(${ancestorHostnames}::text[])
        AND starts_with(ancestor.reversed_hostname, (
          SELECT hostname.reversed_hostname FROM url_hostname_blocks block
          JOIN url_hostnames hostname ON hostname.id = block.url_hostname_id
          WHERE block.id = ${blockId}
        ) || '.')
    `,
  )
  return new Set(rows.map(row => row.reversed_hostname))
}

export async function attachHostnameBlockToAncestorCleanup(
  query: TransactionQuery,
  input: {
    existingBlockId: string | null
    hostnameId: string
    blockedById: string
    blockedSource: string
    rootBlockId: string
  },
): Promise<void> {
  if (input.existingBlockId) {
    await query(sql`/* attachHostnameBlockToAncestorCleanup:existing */
      UPDATE url_hostname_blocks SET relation_cleanup_root_block_id = ${input.rootBlockId}
      WHERE id = ${input.existingBlockId} AND relation_cleanup_root_block_id IS NULL
    `)
  } else {
    await query(sql`/* attachHostnameBlockToAncestorCleanup:insert */
      INSERT INTO url_hostname_blocks (
        id, url_hostname_id, blocked_by_id, blocked_source, relation_cleanup_root_block_id
      ) VALUES (
        ${uuidv7()}, ${input.hostnameId}, ${input.blockedById}, ${input.blockedSource},
        ${input.rootBlockId}
      )
    `)
  }
}
