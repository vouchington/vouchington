import { isSlug, isUUID } from '@modules/utils'
import { caches } from '@services/entity-cache/caches'
import { getAnonymousCacheGeneration } from '@services/entity-cache/anonymous-cache-generation'
import createError from 'http-errors'
import { getCommentReadStateUnderReadableRoot } from './comment-read-state.mts'
import {
  getAnonymousPostRowsByAnyBatch,
  type AnonymousPostRows,
} from './anonymous-snapshot-query.mts'

export type AnonymousPostSnapshot = AnonymousPostRows & {
  readState: 'readable' | 'placeholder' | null
}

const loadDirectSnapshot = caches.anonymous_post_snapshots.cacheGetByAny<AnonymousPostSnapshot>(
  async key => {
    const identifier = key.slice(key.indexOf(':direct:') + ':direct:'.length)
    const rows = await getAnonymousPostRowsByAnyBatch([identifier], 'direct')
    const { post, root } = rows.get(identifier) ?? { post: null, root: null }
    if (!post) return { post: null, root: null, readState: null }
    if (post.post_type !== 'comment') return { post, root, readState: 'readable' }
    if (!root) return { post: null, root: null, readState: null }
    return {
      post,
      root,
      readState: await getCommentReadStateUnderReadableRoot(null, post, root.id),
    }
  },
)

const loadDiscoveryRows = caches.anonymous_post_snapshots.cacheGetByAnyBatch<AnonymousPostRows>(
  async keys => {
    const identifiers = keys.map(key =>
      key.slice(key.indexOf(':discovery:') + ':discovery:'.length),
    )
    const rows = await getAnonymousPostRowsByAnyBatch(identifiers, 'discovery')
    return identifiers.map(identifier => rows.get(identifier) ?? { post: null, root: null })
  },
)

const loadDirectBodyRows = caches.anonymous_post_snapshots.cacheGetByAnyBatch<AnonymousPostRows>(
  async keys => {
    const identifiers = keys.map(key =>
      key.slice(key.indexOf(':direct-body:') + ':direct-body:'.length),
    )
    const rows = await getAnonymousPostRowsByAnyBatch(identifiers, 'direct-body')
    return identifiers.map(identifier => rows.get(identifier) ?? { post: null, root: null })
  },
)

/** The direct route's content and read decision are one cached value. */
export async function getAnonymousPostSnapshotByAnyCached(
  identifier: string,
  mode: 'direct' | 'discovery' = 'direct',
): Promise<AnonymousPostSnapshot> {
  const normalized = normalizeIdentifier(identifier)
  const generation = await getAnonymousCacheGeneration()
  if (mode === 'direct') {
    return (
      (await loadDirectSnapshot(`${generation}:direct:${normalized}`)) ?? {
        post: null,
        root: null,
        readState: null,
      }
    )
  }
  const [row] = await loadDiscoveryRows([`${generation}:discovery:${normalized}`])
  return {
    post: row?.post ?? null,
    root: row?.root ?? null,
    readState: row?.post ? 'readable' : null,
  }
}

/** A bounded page of coherent anonymous bodies; only page-owned IDs may use direct-body. */
export async function getAnonymousPostRowsByIdsCached(
  ids: string[],
  mode: 'discovery' | 'direct-body',
): Promise<AnonymousPostRows[]> {
  if (ids.length === 0) return []
  const generation = await getAnonymousCacheGeneration()
  const normalized = ids.map(normalizeIdentifier)
  const loader = mode === 'discovery' ? loadDiscoveryRows : loadDirectBodyRows
  const rows: AnonymousPostRows[] = []
  for (let start = 0; start < normalized.length; start += 200) {
    const keys = normalized.slice(start, start + 200).map(id => `${generation}:${mode}:${id}`)
    // oxlint-disable-next-line eslint/no-await-in-loop -- Sequential chunks keep each SQL/cache fill bounded to 200 IDs.
    const chunk = await loader(keys)
    rows.push(...chunk.map(row => row ?? { post: null, root: null }))
  }
  return rows
}

function normalizeIdentifier(identifier: string): string {
  const normalized = identifier.trim().toLowerCase()
  if (!isUUID(normalized) && !isSlug(normalized))
    throw createError(422, `Invalid post identifier: ${identifier}`)
  return normalized
}
