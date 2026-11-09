import type { PrivateUser } from '@voucha/types/entities/user'
import type { QueryOptions } from '@data-stores/psql/types'
import { assertCommunityNoLinksAllowed } from '@services/communities/restrictions/enforce'
import assert from 'http-assert'
import { isUUID, normalizeUrlForUrlTable } from '@modules/utils'
import type { TransactionQuery } from '@data-stores/psql'
import { assessUrls } from '@services/urls/upsert'
import { persistAssessedUrls } from '@services/urls/upsert-persist'
import { getCanonicalUrlsByIdBatch } from '@services/urls/get-canonical'
import { isCanonicalWriteConflict } from '@services/urls/canonical-write-retry'
import { getUrlByAny } from '@services/urls/get'
import { findUrlIdByIdentity } from '@services/urls/url-identities'
import { prepareUrlHostnamesForOwnedMutation } from '@services/urls-hostnames/upsert'
import { lockHostnameOwnership } from '@services/urls-hostnames/ownership-lock'
import type { Post, UpdatePostChanges } from '../types.mts'

/** Assess external URL policy without holding the post transaction. */
export async function assessPostLinkEdit(post: Post, changes: UpdatePostChanges) {
  if (changes.url === undefined && changes.url_id === undefined) return { changes }
  assert(post.post_type === 'link', 422, 'url and url_id are only allowed for link posts')
  if (changes.url !== undefined)
    assert(/^https:\/\//i.test(changes.url), 422, 'url must be a valid https URL')
  if (changes.url_id !== undefined) {
    assert(isUUID(changes.url_id), 422, 'url_id must be a valid UUID')
    const [destination] = await getCanonicalUrlsByIdBatch([changes.url_id], { readOnly: false })
    assert(destination, 422, 'url_id does not exist')
    const urls = await assessUrls([destination.url], { preserveHttp: true })
    assert(urls.length > 0, 422, 'URL is blocked or not allowed')
    // Reuse persistence so mutable hostname policy is checked under ownership locks.
    return { changes: { ...changes, url_id: destination.id }, urls }
  }
  const sourceHref = normalizeUrlForUrlTable(changes.url!).toString()
  // A new variant of a known page is inserted pointing at that page's canonical destination.
  const source = await getUrlByAny(sourceHref, { readOnly: false })
  const sourceId = source?.id ?? (await findUrlIdByIdentity(sourceHref, { readOnly: false }))
  const [destination] = sourceId
    ? await getCanonicalUrlsByIdBatch([sourceId], { readOnly: false })
    : []
  assert(!sourceId || destination, 422, 'URL destination changed; retry the edit')
  const hrefs = destination ? [sourceHref, destination.url] : [sourceHref]
  const urls = await assessUrls(hrefs, { preserveHttp: true })
  assert(urls.length === new Set(hrefs).size, 422, 'URL is blocked or not allowed')
  return { changes: destination ? { ...changes, url_id: destination.id } : changes, urls }
}

/** Persist assessed URLs with hostname locks before post mutation locks. */
export async function persistPostLinkEdit(
  query: TransactionQuery,
  userId: string,
  changes: UpdatePostChanges,
  urls: Awaited<ReturnType<typeof assessUrls>>,
): Promise<UpdatePostChanges> {
  await prepareAndLockPostLinkHostnames(query, userId, urls)
  // Persistence locks both assessed alias and terminal until the post transaction commits.
  const persisted = await persistAssessedUrls(userId, urls, { query }).catch((err: unknown) => {
    if (isCanonicalWriteConflict(err)) assert(false, 422, 'URL destination changed; retry the edit')
    throw err
  })
  const url = persisted.find(candidate => candidate.url === urls[0]?.toString())
  assert(url, 422, 'URL is blocked or not allowed')
  if (changes.url_id === undefined) {
    // A previously unknown raw URL must not acquire an unassessed canonical destination.
    assert(url.canonical_url_id === null, 422, 'URL destination changed; retry the edit')
    return { ...changes, url_id: url.id }
  }
  const [destination] = await getCanonicalUrlsByIdBatch([url.id], { query, readOnly: false })
  assert(destination?.id === changes.url_id, 422, 'URL destination changed; retry the edit')
  return { ...changes, url_id: destination.id }
}

/** Apply the community link policy to a content edit before it is persisted. */
export async function assertCommunityLinkEditAllowed(
  creator: PrivateUser,
  post: Post,
  changes: UpdatePostChanges,
  options: QueryOptions,
): Promise<void> {
  if (!post.community_id) return
  await assertCommunityNoLinksAllowed({
    communityId: post.community_id,
    currentUser: creator,
    options,
    updates: {
      title: changes.title,
      markdown: changes.markdown,
      structured_data: changes.structured_data,
      url: changes.url,
      url_id: changes.url_id,
    },
  })
}

async function prepareAndLockPostLinkHostnames(
  query: TransactionQuery,
  userId: string,
  urls: Awaited<ReturnType<typeof assessUrls>>,
): Promise<void> {
  const resolved = await prepareUrlHostnamesForOwnedMutation(
    userId,
    urls.map(url => url.hostname),
    query,
  )
  await lockHostnameOwnership(query, [...resolved.values()])
}
