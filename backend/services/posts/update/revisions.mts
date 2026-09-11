import { createPostRevision, type PostRevisionChanges } from '@services/post-revisions'
import type { QueryOptions } from '@data-stores/psql/types'
import type { Post, UpdatePostChanges } from '../types.mts'

export async function createUpdatePostRevision(
  post: Post,
  changes: UpdatePostChanges,
  creatorId: string,
  options: QueryOptions,
) {
  const revisionChanges = getPostRevisionChanges(post, changes)
  if (Object.keys(revisionChanges).length > 0) {
    await createPostRevision(post.id, 'update', revisionChanges, creatorId, options)
  }
}

function getPostRevisionChanges(post: Post, changes: UpdatePostChanges): PostRevisionChanges {
  const revisionChanges: PostRevisionChanges = {}
  if (changes.title !== undefined && changes.title !== post.title)
    revisionChanges.title = { before: post.title, after: changes.title }
  if (changes.markdown !== undefined && changes.markdown !== post.markdown)
    revisionChanges.markdown = { before: post.markdown, after: changes.markdown }
  if (
    changes.ai_summary_markdown !== undefined &&
    changes.ai_summary_markdown !== post.ai_summary_markdown
  )
    revisionChanges.ai_summary_markdown = {
      before: post.ai_summary_markdown,
      after: changes.ai_summary_markdown,
    }
  if (changes.broadcast !== undefined && changes.broadcast !== post.broadcast)
    revisionChanges.broadcast = { before: post.broadcast, after: changes.broadcast }
  if (changes.privacy !== undefined && changes.privacy !== post.privacy)
    revisionChanges.privacy = { before: post.privacy, after: changes.privacy }
  if (changes.is_anonymous !== undefined && changes.is_anonymous !== post.is_anonymous)
    revisionChanges.is_anonymous = { before: post.is_anonymous, after: changes.is_anonymous }
  if (
    changes.structured_data !== undefined &&
    JSON.stringify(changes.structured_data) !== JSON.stringify(post.structured_data)
  )
    revisionChanges.structured_data = {
      before: post.structured_data,
      after: changes.structured_data,
    }
  if (
    changes.data_point_vertical !== undefined &&
    changes.data_point_vertical !== post.data_point_vertical
  )
    revisionChanges.data_point_vertical = {
      before: post.data_point_vertical,
      after: changes.data_point_vertical,
    }
  if (
    changes.declared_language !== undefined &&
    changes.declared_language !== post.declared_language
  )
    revisionChanges.declared_language = {
      before: post.declared_language,
      after: changes.declared_language,
    }
  if (changes.categories !== undefined)
    revisionChanges.categories = {
      before: post.post_explicit_categories ?? [],
      after: changes.categories,
    }
  if (changes.slug !== undefined && changes.slug !== post.slug)
    revisionChanges.slug = { before: post.slug, after: changes.slug }
  if (changes.archive === true && !post.archived_at)
    revisionChanges.archived_at = { before: null, after: 'now' }
  if (changes.archive === false && post.archived_at)
    revisionChanges.archived_at = { before: post.archived_at, after: null }
  return revisionChanges
}
