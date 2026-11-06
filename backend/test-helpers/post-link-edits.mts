import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { getUrlById } from '../services/urls/get.mts'
import { getPostByAny } from '../services/posts/get.mts'
import { persistPostLinkEdit } from '../services/posts/update/link-url.mts'
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
