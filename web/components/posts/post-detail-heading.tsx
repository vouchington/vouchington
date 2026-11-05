import type { ReactNode } from 'react'
import Link from 'next/link'
import { getContentLanguageDir } from '@ts-shared/languages/content-languages'
import { PostContentText } from '@/components/posts/post-content-text'
import type { Post, PostCommunity } from '@/types/posts'
import { getCanonicalPostPath } from '@/lib/post-helpers'
import { PostDetailBadges, type PostDetailBadgeLabels } from './post-detail-badges'
import { hasPostOverflowActions } from './post-detail-overflow-guard'
import { PostDetailOverflowLazy } from './post-detail-overflow-lazy'
import { getPostDetailTitle } from './post-detail-title'

export function PostDetailHeading({
  post,
  labels,
  community,
  isCommunityMod,
  isPostPinned,
  isOwner,
  isAdmin,
  currentUserId,
  children,
}: {
  post: Post
  labels: {
    badges: PostDetailBadgeLabels
    ratingAriaLabel: (name: string, rating: number) => string
  }
  community?: PostCommunity | null
  isCommunityMod?: boolean
  isPostPinned?: boolean
  isOwner: boolean
  isAdmin: boolean
  currentUserId: string | null
  children: ReactNode
}) {
  const { trimmedTitle, hasAuthoredTitle, heading, contentLanguage } = getPostDetailTitle(post)
  const isAuthenticated = currentUserId != null
  const reviewTopicIds = new Set((post.review_topic_ratings ?? []).map(r => r.topic_id))
  const categoryTopics = (post.post_related_topics ?? [])
    .filter(t => !reviewTopicIds.has(t.id))
    .slice(0, 5)
  const overflowVisible = hasPostOverflowActions(post, {
    isAuthenticated,
    isOwner,
    isAdmin,
    currentUserId,
  })

  return (
    <>
      {overflowVisible ? (
        <PostDetailOverflowLazy
          post={{
            id: post.id,
            slug: post.slug,
            post_type: post.post_type,
            privacy: post.privacy,
            broadcast: post.broadcast,
            created_by_id: post.created_by_id,
            can_edit_content: post.can_edit_content,
            can_delete: post.can_delete,
            can_lock: post.can_lock,
            can_unpublish_from_community: post.can_unpublish_from_community,
            community_id: post.community_id,
            locked_at: post.locked_at,
          }}
          // null = route explicitly says no community; undefined = prop omitted, fall back to post.community
          communitySlug={(community !== undefined ? community : post.community)?.slug}
          isCommunityMod={isCommunityMod}
          isPostPinned={isPostPinned}
          className='absolute right-2 top-2 z-20'
        />
      ) : null}
      <div className='space-y-4'>
        <h1
          className={`text-xl font-bold tracking-tight sm:text-2xl${overflowVisible ? ' pr-14' : ''}`}
          data-pw='post-detail-heading'
          lang={hasAuthoredTitle ? contentLanguage : undefined}
          dir={hasAuthoredTitle ? getContentLanguageDir(contentLanguage) : undefined}
        >
          {post.post_type !== 'comment' ? (
            <PostContentText
              as={Link}
              href={getCanonicalPostPath(post)}
              prefetch={false}
              className='hover:underline focus-visible:underline'
              content={
                hasAuthoredTitle
                  ? {
                      text: trimmedTitle,
                      declared_language: post.declared_language,
                      lingua_rs_detected_language: post.lingua_rs_detected_language,
                    }
                  : null
              }
              fallback={heading}
            />
          ) : (
            heading
          )}
        </h1>
        <PostDetailBadges
          categoryTopics={categoryTopics}
          postType={post.post_type}
          broadcast={post.broadcast}
          privacy={post.privacy}
          locked={post.locked_at != null}
          reviewRatings={(post.review_topic_ratings ?? []).flatMap(rating =>
            rating.topic
              ? [
                  {
                    topicId: rating.topic_id,
                    topic: rating.topic,
                    rating: rating.rating,
                    ariaLabel: labels.ratingAriaLabel(rating.topic.name, rating.rating),
                  },
                ]
              : [],
          )}
          community={community !== undefined ? community : post.community}
          provenance={post.provenance}
          staffProvenance={post.staff_provenance}
          labels={labels.badges}
        />
        {children}
      </div>
    </>
  )
}
