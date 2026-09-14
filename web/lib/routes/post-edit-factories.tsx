/**
 * Factory functions for post edit and tags management routes.
 *
 * Each factory closes over a hardcoded postType/slug constant, eliminating the
 * runtime check that was needed in the old catch-all dynamic segment.
 */

import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'

import { EditPostPage } from '@/components/posts/edit-post-page'
import { ManagePostTags } from '@/components/tags/manage-post-tags'
import { getPost } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getTranslations } from '@/lib/i18n/get-translations'
import { canCurrentUserSeeDownvotes } from '@/lib/permissions/can-see-downvotes'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { type EditablePostType, isEditablePostType } from '@/lib/post-editability'
import type { PostType } from '@/types/posts'

interface DetailPageProps {
  params: Promise<{ id: string }>
}
interface TagsPageProps {
  params: Promise<{ id: string; objectType: string }>
}

const editTitles: Record<EditablePostType, string> = {
  review: 'Edit Review',
  discussion: 'Edit Discussion',
  data_point: 'Edit Data Point',
  article: 'Edit Article',
  blog_post: 'Edit Blog Post',
}

export function createPostEditPage(postType: PostType, _slug: string) {
  if (!isEditablePostType(postType)) {
    throw new Error(`createPostEditPage called with non-editable post type: ${postType}`)
  }

  const editablePostType = postType
  const title = editTitles[editablePostType]

  async function generateMetadata(): Promise<Metadata> {
    return createNoIndexMetadata(title)
  }

  async function PostEditRoutePage({ params }: DetailPageProps) {
    const { id } = await params
    return (
      <EditPostPage
        id={id}
        postType={editablePostType}
        title={title}
      />
    )
  }

  return { generateMetadata, default: PostEditRoutePage }
}

export function createPostTagsPage(postType: PostType, slug: string) {
  async function PostTagsRoutePage({ params }: TagsPageProps) {
    const { id, objectType } = await params

    if (objectType !== 'topic' && objectType !== 'post' && objectType !== 'url') notFound()

    const currentUser = await getCurrentUser()
    if (!currentUser) redirect('/login')

    const [postData, t] = await Promise.all([getPost(id), getTranslations()])
    if (!postData || postData.post.post_type !== postType) notFound()

    return (
      <ManagePostTags
        t={t}
        postData={postData}
        hideDownCount={!canCurrentUserSeeDownvotes(currentUser)}
        slug={slug}
        objectType={objectType}
      />
    )
  }

  return { default: PostTagsRoutePage }
}
