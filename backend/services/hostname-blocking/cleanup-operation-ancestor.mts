import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

export async function lockPendingAncestorHostnameBlockCleanup(
  query: TransactionQuery,
  hostname: string,
): Promise<string | null> {
  const labels = hostname.split('.')
  const ancestors = labels.slice(1).map((_, index) => labels.slice(index + 1).join('.'))
  if (ancestors.length === 0) return null

  const { rows } = await query<{ id: string }>(sql`/* lockPendingAncestorHostnameBlockCleanup */
    SELECT root.id FROM url_hostnames ancestor
    JOIN url_hostname_blocks root ON root.url_hostname_id = ancestor.id
    WHERE ancestor.hostname = ANY(${ancestors}::text[])
      AND root.lifted_at IS NULL AND root.domain_blocklist_source_id IS NULL
      AND root.relation_cleanup_root_block_id = root.id
      AND root.relation_cleanup_completed_at IS NULL
    ORDER BY root.id LIMIT 1 FOR UPDATE OF root
  `)
  return rows[0]?.id ?? null
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

  const { rows } = await query<{ reversed_hostname: string }>(
    sql`/* getPendingDescendantCleanupRootHostnames */
      SELECT hostname.reversed_hostname FROM url_hostnames hostname
      JOIN url_hostname_blocks root ON root.url_hostname_id = hostname.id
      WHERE hostname.reversed_hostname = ANY(${ancestorReversedHostnames}::text[])
        AND root.id <> ${blockId} AND root.lifted_at IS NULL
        AND root.domain_blocklist_source_id IS NULL
        AND root.relation_cleanup_root_block_id = root.id
        AND root.relation_cleanup_completed_at IS NULL
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
  await query(sql`/* attachHostnameBlockToAncestorCleanup:count */
    UPDATE url_hostname_blocks
    SET relation_cleanup_blocked_hostname_count = relation_cleanup_blocked_hostname_count + 1
    WHERE id = ${input.rootBlockId} AND relation_cleanup_completed_at IS NULL
  `)
}
