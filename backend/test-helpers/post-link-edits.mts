import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { getUrlById } from '../services/urls/get.mts'
import { getPostByAny } from '../services/posts/get.mts'
import { persistPostLinkEdit } from '../services/posts/update/link-url.mts'
import { setCanonicalUrl } from '../services/urls/set-canonical.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { createTestUser } from './entities/users.mts'
import { createTestUrlWithHostname } from './entities/urls.mts'
import { insertTestPost } from './entities/posts.mts'
import { updateUrlHostnameBlocked } from './entities/url-hostnames/mutations.mts'

export async function createPostLinkEditFixtureForTest() {
  const user = await createTestUser()
  const originalId = await createTestUrlWithHostname()
  const postId = await insertTestPost({
    title: 'Owned link edit',
    slug: `link-edit-${randomUUID()}`,
    markdown: '',
    createdById: user.id,
    postType: 'link',
    urlId: originalId,
  })
  const post = await getPostByAny(postId)
  if (!post) throw new Error('Expected owned link post')
  return { user, originalId, post }
}

export async function blockPostLinkDestinationForTest(urlId: string) {
  const url = await getUrlById(urlId, { readOnly: false })
  if (!url) throw new Error('Expected destination URL')
  await updateUrlHostnameBlocked(url.hostname.id, true)
}

/** Probe the real persistence phase without committing an edit or exposing a raw transaction. */
export async function persistAssessedPostLinkEditForTest(
  userId: string,
  changes: Parameters<typeof persistPostLinkEdit>[2],
  urls: Parameters<typeof persistPostLinkEdit>[3],
): Promise<void> {
  await using query = await beginTransaction()
  await persistPostLinkEdit(query, userId, changes, urls)
}

/** Hold real link persistence while a real canonical rewrite reaches its native advisory wait. */
export async function persistPostLinkWhileCanonicalRewriteForTest(
  userId: string,
  changes: Parameters<typeof persistPostLinkEdit>[2],
  urls: Parameters<typeof persistPostLinkEdit>[3],
  rewrittenUrlId: string,
  nextDestinationId: string,
): Promise<{ selectedId: string; rewrittenId: string }> {
  await using holder = await beginTransaction()
  const persisted = await persistPostLinkEdit(holder, userId, changes, urls)
  if (!persisted.url_id) throw new Error('Expected a persisted link destination')
  const holderProcessId = await getTestPostgresBackendProcessId(holder)
  const rewrittenId = await withTestOwnedPostgresWait(
    {
      holderProcessId,
      pool: 'write',
      lock: {
        kind: 'advisory',
        key: 'url-canonicalization',
        holderMode: 'shared',
        waiterMode: 'exclusive',
      },
      queryMarker: 'lockCanonicalUrlRewrites',
      releaseHolder: () => holder[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const pending = setCanonicalUrl(rewrittenUrlId, nextDestinationId)
      await waitForLock(pending)
      await holder.commit()
      return pending
    },
  )
  return { selectedId: persisted.url_id, rewrittenId }
}
