import { write } from '@data-stores/psql'

export async function countTestPostPublicationCommunityIdentities(id: string): Promise<string> {
  const { rows } = await write<{ count: string }>(
    `/* postPublicationCommunityIdentityCountForTest */
     SELECT count(*)::text AS count FROM post_publication_community_identities WHERE id = $1`,
    [id],
  )
  return rows[0]?.count ?? '0'
}
