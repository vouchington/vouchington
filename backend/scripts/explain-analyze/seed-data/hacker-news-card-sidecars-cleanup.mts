import { beginTransaction } from '@data-stores/psql'

export async function cleanupHackerNewsCardSidecars(
  postIds: readonly string[],
  hostnameId: string,
  actorId: string,
): Promise<void> {
  await using remove = await beginTransaction()
  await remove(
    `/* cleanupHackerNewsCardSidecars:relatedUrls */
     DELETE FROM relation__post__related__url WHERE subject_id = ANY($1::uuid[])`,
    [postIds],
  )
  await remove(
    '/* cleanupHackerNewsCardSidecars:posts */ DELETE FROM posts WHERE id = ANY($1::uuid[])',
    [postIds],
  )
  // The fixture hostname owns the URLs and their Hacker News rows through foreign keys.
  await remove(
    '/* cleanupHackerNewsCardSidecars:hostname */ DELETE FROM url_hostnames WHERE id = $1',
    [hostnameId],
  )
  await remove('/* cleanupHackerNewsCardSidecars:actor */ DELETE FROM users WHERE id = $1', [
    actorId,
  ])
  await remove(
    '/* cleanupHackerNewsCardSidecars:postIdentities */ DELETE FROM retained_post_identities WHERE id = ANY($1::uuid[])',
    [postIds],
  )
  await remove(
    '/* cleanupHackerNewsCardSidecars:userIdentity */ DELETE FROM retained_user_identities WHERE id = $1',
    [actorId],
  )
  await remove.commit()
}
