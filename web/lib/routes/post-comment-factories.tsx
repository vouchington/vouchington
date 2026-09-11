/**
 * Factory function for post comment permalink routes.
 *
 * Closes over a hardcoded postType/slug constant, eliminating the
 * runtime check that was needed in the old catch-all dynamic segment.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { CommentPermalink } from '@/components/comments/comment-permalink'
import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { getPostAncestors, getPostDescendants } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getTranslations } from '@/lib/i18n/get-translations'
import { canCurrentUserSeeDownvotes } from '@/lib/permissions/can-see-downvotes'
import { isIndexableForSeo } from '@/lib/seo/indexability'
import { createExcerpt, createNoIndexMetadata, createPageMetadata } from '@/lib/seo/metadata'
import { buildCommentsForSchema, buildInteractionStats } from '@/lib/seo/post-schema-helpers'
import { createPostSchema } from '@/lib/seo/post-schema'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { createBreadcrumbSchema } from '@/lib/seo/structured-data'
import { communityHref, createUserPathname } from '@/lib/links/entity-href'
import { getPostPath } from '@/lib/post-helpers'
import { getEffectiveContentLanguage } from '@ts-shared/languages/content-languages'
import type { Post, PostType } from '@/types/posts'
import type { PostsResponseBody } from '@/types/api-responses'

interface CommentPageProps {
  params: Promise<{ id: string; commentId: string }>
}

function getRootPostFromResponse(data: PostsResponseBody): Post | null {
  const rootPostId = data.results[0]?.id
  if (!rootPostId) return null
  return data.posts[rootPostId] ?? null
}

function getVoteScoreNetFromData(data: PostsResponseBody, post: Post): number | null {
  const election = data.post_elections?.[post.id]
  if (!election) return null
  return election.votes_count_up - election.votes_count_down
}

export function createCommentPermalinkPage(postType: PostType, slug: string) {
  async function generateMetadata({ params }: CommentPageProps): Promise<Metadata> {
    const { commentId } = await params
    try {
      const ancestors = await getPostAncestors(commentId, { limit: 5 })
      const rootPost = getRootPostFromResponse(ancestors)
      if (!rootPost) return createNoIndexMetadata()
      if (rootPost.post_type !== postType) return createNoIndexMetadata()

      const voteScoreNet = getVoteScoreNetFromData(ancestors, rootPost)
      const isRestrictedAudience =
        rootPost.privacy !== 'public' || rootPost.broadcast !== 'everyone'
      const targetPost = ancestors.posts[commentId] ?? rootPost

      const rootPostPath = getPostPath(slug, rootPost)
      return createPageMetadata({
        title: `Comment on ${rootPost.title || 'Untitled Post'}`,
        description: createExcerpt(
          ancestors.markdown_to_html?.[commentId] ?? targetPost.markdown ?? rootPost.markdown,
        ),
        path: `${rootPostPath}/comment/${commentId}`,
        noIndex:
          isRestrictedAudience ||
          voteScoreNet === null ||
          !isIndexableForSeo(voteScoreNet) ||
          !!rootPost.archived_at,
        type: 'article',
        publishedTime: targetPost.created_at,
        modifiedTime: targetPost.updated_at,
        authors: targetPost.created_by?.username ? [targetPost.created_by.username] : undefined,
        contentLanguage: getEffectiveContentLanguage({
          declaredLanguage: targetPost.declared_language,
          detectedLanguage: targetPost.lingua_rs_detected_language,
        }),
      })
    } catch {
      return createNoIndexMetadata()
    }
  }

  async function CommentPermalinkRoutePage({ params }: CommentPageProps) {
    const { commentId } = await params

    const emptyDescendants: PostsResponseBody = {
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      posts: {},
      posts_metrics: {},
      post_elections: {},
      markdown_to_html: {},
    }

    const [ancestors, descendants, currentUser, t] = await Promise.all([
      getPostAncestors(commentId, { limit: 5 }).catch(() => null),
      getPostDescendants(commentId).catch(() => emptyDescendants),
      getCurrentUser(),
      getTranslations(),
    ])

    if (!ancestors) notFound()
    const rootPost = getRootPostFromResponse(ancestors)
    if (!rootPost) notFound()
    if (rootPost.post_type !== postType) notFound()

    const targetPost = ancestors.posts[commentId] ?? descendants.posts[commentId]
    const targetHtml =
      ancestors.markdown_to_html?.[commentId] ?? descendants.markdown_to_html?.[commentId] ?? ''
    const rootPostPath = getPostPath(slug, rootPost)
    const canonicalPath = `${rootPostPath}/comment/${commentId}`
    const rootCommunity = rootPost.community_id
      ? (ancestors.communities?.[rootPost.community_id] ?? rootPost.community)
      : null

    // Community posts root at the community crumb (not the Posts intent).
    const breadcrumbItems = buildBreadcrumbsForPath(canonicalPath, {
      intentCrumbOverride: rootCommunity
        ? { name: rootCommunity.name, path: communityHref(rootCommunity) }
        : undefined,
      isAuthenticated: !!currentUser,
      userRoles: currentUser?.roles ?? [],
      tail: [
        {
          name: rootPost.title || 'Untitled Post',
          path: rootPostPath,
        },
        { name: 'Comment', path: canonicalPath },
      ],
    })

    const authorUsername =
      (targetPost?.is_anonymous ? undefined : targetPost?.created_by?.username) ??
      (rootPost.is_anonymous ? undefined : rootPost.created_by?.username)

    return (
      <div className='space-y-6'>
        <AnonymousStructuredDataScript
          data={createPostSchema({
            kind: 'comment',
            title: `Comment on ${rootPost.title || 'Untitled Post'}`,
            description: createExcerpt(targetHtml || targetPost?.markdown || rootPost.markdown),
            path: canonicalPath,
            createdAt: targetPost?.created_at ?? rootPost.created_at,
            updatedAt: targetPost?.updated_at ?? rootPost.updated_at,
            authorName: authorUsername,
            authorUrl: authorUsername ? createUserPathname(authorUsername) : undefined,
            comments: buildCommentsForSchema(descendants),
            interactionStats: buildInteractionStats(
              ancestors.post_elections?.[targetPost?.id ?? rootPost.id],
              ancestors.posts_metrics?.[targetPost?.id ?? rootPost.id],
            ),
          })}
        />
        {breadcrumbItems.length > 0 && (
          <AnonymousStructuredDataScript data={createBreadcrumbSchema(breadcrumbItems)} />
        )}
        <Breadcrumbs items={breadcrumbItems} />

        <CommentPermalink
          targetCommentId={commentId}
          rootPostId={rootPost.id}
          rootPostType={slug}
          rootPost={rootPost}
          ancestors={ancestors}
          descendants={descendants}
          isAdmin={currentUser?.roles.includes('administrator') ?? false}
          hideDownCount={!canCurrentUserSeeDownvotes(currentUser)}
          t={t}
        />
      </div>
    )
  }

  return { generateMetadata, default: CommentPermalinkRoutePage }
}
