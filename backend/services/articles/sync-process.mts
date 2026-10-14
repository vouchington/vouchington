import onError from '@modules/on-error'
import { createPost } from '@services/posts/create'
import { tagPostWithTopics } from '@services/posts/tagging'
import type { Post } from '@services/posts/types'
import { updatePost } from '@services/posts/update'
import type { PrivateUser } from '@services/users/types'
import { SYSTEM_PROVENANCE } from '@voucha/types/entities/content-provenance'

import { contentHash, lookupKey, type PreparedArticle } from './sync-helpers.mts'

export async function processPreparedArticles(
  currentUser: PrivateUser,
  prepared: PreparedArticle[],
  existingBySlug: Map<string, Post>,
): Promise<void> {
  // Different slugs and UUIDs can resolve to the same post. Keep the current
  // state by ID so every alias sees a preceding file's successful update.
  const currentById = new Map([...existingBySlug.values()].map(post => [post.id, post]))
  for (const { item, slug, title, body, topics, postType, fileHash } of prepared) {
    try {
      const key = lookupKey(slug)
      const prefetched = existingBySlug.get(key)
      const existing = prefetched && (currentById.get(prefetched.id) ?? prefetched)

      if (existing) {
        if (existing.post_type !== postType) {
          item.action = 'error'
          item.error = `Post type mismatch: existing="${existing.post_type}", expected="${postType}"`
          continue
        }

        const existingHash = contentHash(existing.title, existing.markdown)

        if (fileHash === existingHash) {
          item.action = 'skipped'
          if (topics?.length) {
            // oxlint-disable-next-line no-await-in-loop -- topic tagging must finish before this file's result is recorded
            await tagPostWithTopics(currentUser, existing.id, topics)
          }
        } else {
          // oxlint-disable-next-line no-await-in-loop -- duplicate slugs require the update to finish before processing the next file
          const updated = await updatePost(currentUser, existing, { markdown: body, title })
          currentById.set(updated.id, updated)
          item.action = 'updated'
          if (topics?.length) {
            // oxlint-disable-next-line no-await-in-loop -- topic tagging follows the completed update for this file
            await tagPostWithTopics(currentUser, existing.id, topics)
          }
        }
      } else {
        // Articles are platform-authored from the repository, whichever job or script syncs them.
        // oxlint-disable-next-line no-await-in-loop -- duplicate slugs require creation to finish before processing the next file
        const post = await createPost(currentUser, SYSTEM_PROVENANCE, {
          post_type: postType,
          title,
          markdown: body,
          slug,
          broadcast: 'everyone',
          privacy: 'public',
        })
        existingBySlug.set(key, post)
        currentById.set(post.id, post)
        item.action = 'created'

        if (topics?.length) {
          // oxlint-disable-next-line no-await-in-loop -- topic tagging follows the completed creation for this file
          await tagPostWithTopics(currentUser, post.id, topics)
        }
      }
    } catch (err) {
      item.action = 'error'
      item.error = err instanceof Error ? err.message : String(err)
      if (err instanceof Error) onError(err)
    }
  }
}
