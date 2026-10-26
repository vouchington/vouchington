import type { TransactionQuery } from '@data-stores/psql'

/** Classifier history retains a community identity after the live community is removed. */
export async function retainPublicationIdentityBridges(
  query: TransactionQuery,
  family: 'community',
  ids: readonly string[],
): Promise<void> {
  if (family !== 'community')
    throw new TypeError('Only classifier community identities are retained')
  if (ids.length === 0) return
  const ordered = [...new Set(ids.map(id => id.toLowerCase()))].toSorted()
  await query(
    `/* fencePublicationCommunityIdentityCapture */
    SELECT pg_advisory_xact_lock_shared(hashtextextended('publication-identity:community:' || input.id::text, 0))
    FROM unnest($1::uuid[]) input(id) ORDER BY input.id`,
    [ordered],
  )
  await query(
    `/* retainPublicationCommunityIdentity */
    INSERT INTO post_publication_community_identities (id, community_id)
    SELECT input.id, community.id FROM unnest($1::uuid[]) input(id)
    LEFT JOIN communities community ON community.id = input.id ORDER BY input.id
    ON CONFLICT (id) DO NOTHING`,
    [ordered],
  )
  await query(
    `/* sharePublicationCommunityIdentityOwnership */
    SELECT id FROM post_publication_community_identities
    WHERE id = ANY($1::uuid[]) ORDER BY id FOR KEY SHARE`,
    [ordered],
  )
}
