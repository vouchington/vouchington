import { bookmarkEntity } from '@services/bookmarks/upsert'
import type { Post } from '@services/posts/types'
import type { PrivateUser } from '@services/users/types'
import onError from '@modules/on-error'

type ReportableError = Error & {
  tags?: Record<string, string | number | boolean>
  extra?: Record<string, unknown>
}

export async function autoSubscribePostCreator(post: Post, creator?: PrivateUser | null) {
  if (!creator) return

  try {
    await bookmarkEntity(creator, 'post', { id: post.id }, 'subscribe')
  } catch (error) {
    if (error instanceof Error) {
      const enrichedError = error as ReportableError
      enrichedError.tags = { creatorId: creator.id, postId: post.id }
      enrichedError.extra = { context: 'processPostCreated.autoSubscribe' }
      onError(enrichedError)
      return
    }

    const fallbackError = new Error('Failed to auto-subscribe post creator', {
      cause: error,
    }) as ReportableError
    fallbackError.tags = { creatorId: creator.id, postId: post.id }
    fallbackError.extra = { context: 'processPostCreated.autoSubscribe' }
    onError(fallbackError)
  }
}
