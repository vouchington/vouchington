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
    WITH ancestors AS MATERIALIZED (
      SELECT id, hostname, cardinality(string_to_array(hostname, '.')) AS specificity
      FROM url_hostnames WHERE hostname = ANY(${ancestors}::text[])
    ), candidate AS MATERIALIZED (
      SELECT root.id FROM ancestors ancestor
      CROSS JOIN LATERAL (
        WITH matching_root AS MATERIALIZED (
          SELECT root.id FROM url_hostname_blocks root
          WHERE root.url_hostname_id = ancestor.id AND root.lifted_at IS NULL
            AND root.domain_blocklist_source_id IS NULL
            AND root.relation_cleanup_root_block_id = root.id
            AND root.relation_cleanup_completed_at IS NULL
        )
        SELECT id FROM matching_root
      ) root
      ORDER BY ancestor.specificity DESC, root.id LIMIT 1
    )
    SELECT root.id, root.relation_cleanup_stage AS stage,
      root.should_penalize_relation_creators AS "penalizeCreators"
    FROM url_hostname_blocks root
    JOIN candidate ON candidate.id = root.id
    WHERE root.lifted_at IS NULL AND root.domain_blocklist_source_id IS NULL
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

  const { rows } = await query<{ reversed_hostname: string }>(
    sql`/* getPendingDescendantCleanupRootHostnames */
      WITH current_root AS MATERIALIZED (
        SELECT hostname.reversed_hostname FROM url_hostname_blocks block
        JOIN url_hostnames hostname ON hostname.id = block.url_hostname_id
        WHERE block.id = ${blockId}
      ), candidate_ancestors AS MATERIALIZED (
        SELECT hostname.id, hostname.reversed_hostname FROM url_hostnames hostname
        JOIN current_root ON starts_with(hostname.reversed_hostname, current_root.reversed_hostname || '.')
        WHERE hostname.reversed_hostname = ANY(${ancestorReversedHostnames}::text[])
      )
      SELECT ancestor.reversed_hostname FROM candidate_ancestors ancestor
      CROSS JOIN LATERAL (
        WITH matching_root AS MATERIALIZED (
          SELECT 1 FROM url_hostname_blocks root
          WHERE root.url_hostname_id = ancestor.id AND root.id <> ${blockId}
            AND root.lifted_at IS NULL AND root.domain_blocklist_source_id IS NULL
            AND root.relation_cleanup_root_block_id = root.id
            AND root.relation_cleanup_completed_at IS NULL
        )
        SELECT 1 FROM matching_root
      ) owned
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
