/* oxlint-disable max-lines -- post detail aggregates auth, moderation, community, and content rendering concerns; community-mod pin props push it just over */
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  getContentLanguageDir,
  getEffectiveContentLanguage,
} from '@ts-shared/languages/content-languages'
import { humanizePostType } from '@ts-shared/utils/format'
import { MARKDOWN_CONTENT_FEATURES_RICH_EAGER } from '@/components/shared/markdown-content-features'
import { MarkdownContent } from '@/components/shared/markdown-content'
import { PostContentText } from '@/components/posts/post-content-text'
import { PostImage } from '@/components/shared/post-image'
import type { Post, PostElection, PostCommunity } from '@/types/posts'
import type { DataPointVertical } from '@voucha/types/entities/data-point'
import { getCanonicalPostPath } from '@/lib/post-helpers'
import { DataPointDetail } from './data-point-detail'
import { LinkPostMedia } from './link-post-media'
import { PostDetailActions } from './post-detail-actions'
import { PostDetailBadges, type PostDetailBadgeLabels } from './post-detail-badges'
import { PostDetailImages } from './post-detail-images'
import { PostDetailMetadata } from './post-detail-metadata'
import { ContentRemovedNotice } from '@/components/moderation/notices/content-removed-notice'
import { ContentUnavailableNotice } from '@/components/moderation/notices/content-unavailable-notice'
import type { PostResponseBody } from '@/types/api-responses'

import { hasPostOverflowActions } from './post-detail-overflow-guard'
import { PostDetailOverflowLazy } from './post-detail-overflow-lazy'

export interface PostDetailViewProps {
  post: Post
  election?: PostElection
  existingVoteChoice?: import('@/lib/api/client/elections').ElectionVoteChoice
  html: string
  hideDownCount?: boolean
  initialSaved?: boolean
  initialHidden?: boolean
  isOwner?: boolean
  isAdmin?: boolean
  currentUserId?: string | null
  labels?: {
    underReview: string
    badges: PostDetailBadgeLabels
    ratingAriaLabel: (name: string, rating: number) => string
    postedBy: (authorName: string) => string
    metadataSeparator: string
    dataPoint: { creditCard: string; bankAccount: string }
  }
  /** True when the viewer is an administrator or moderator — enables the sensitive-media blur gate. */
  isModerator?: boolean
  community?: PostCommunity | null
  isCommunityMod?: boolean
  isPostPinned?: boolean
  linkEmbed?: PostResponseBody['link_embed']
}

const DEFAULT_POST_DETAIL_LABELS: NonNullable<PostDetailViewProps['labels']> = {
  underReview: 'Under review',
  badges: {
    private: 'Private',
    locked: 'Locked',
    followers: 'Followers',
    signedIn: 'Signed In',
    mutual: 'Mutual',
  },
  ratingAriaLabel: (name, rating) => `${name}: ${rating} out of 5 stars`,
  postedBy: authorName => `Posted by ${authorName}`,
  metadataSeparator: '•',
  dataPoint: { creditCard: 'Credit card data point', bankAccount: 'Bank account data point' },
}

// oxlint-disable-next-line react-doctor/no-many-boolean-props -- post detail inherits auth/moderation booleans from the route layer; flattening to a role enum would require a larger refactor
export function PostDetailView({
  post,
  election,
  existingVoteChoice,
  html,
  hideDownCount = true,
  initialSaved = false,
  initialHidden = false,
  isOwner = false,
  isAdmin = false,
  isModerator,
  community,
  isCommunityMod,
  isPostPinned,
  linkEmbed,
  currentUserId = null,
  labels = DEFAULT_POST_DETAIL_LABELS,
}: PostDetailViewProps) {
  const isAuthenticated = currentUserId != null
  const trimmedTitle = post.title?.trim()
  const hasAuthoredTitle = Boolean(trimmedTitle)
  const heading = hasAuthoredTitle ? trimmedTitle : `Untitled ${humanizePostType(post.post_type)}`
  const authorName = post.created_by?.username ?? (post.is_anonymous ? 'Anonymous' : 'Unknown')

  // Category topics deduped from review topic IDs (same logic as PostCard)
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

  const contentLanguage = getEffectiveContentLanguage({
    declaredLanguage: post.declared_language,
    detectedLanguage: post.lingua_rs_detected_language,
  })
  const isRejected = post.clearance_status === 'rejected'
  const isStaffViewer = isAdmin || !!isModerator || isCommunityMod === true
  const canDiscussInCommunity =
    !post.community_id &&
    post.post_type !== 'comment' &&
    post.broadcast === 'everyone' &&
    post.privacy === 'public' &&
    post.clearance_status === 'approved' &&
    !post.locked_at

  return (
    <Card className='relative p-4'>
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
          labels={labels.badges}
        />

        {/* Data point details */}
        {post.post_type === 'data_point' &&
          post.data_point_vertical &&
          (!isRejected || isStaffViewer) && (
            <DataPointDetail
              vertical={post.data_point_vertical as DataPointVertical}
              structuredData={post.structured_data}
              labels={labels.dataPoint}
            />
          )}

        {(!isRejected || isStaffViewer) && (
          <PostDetailImages
            heading={heading}
            isModerator={isStaffViewer}
            isSensitive={post.openai_omni_moderation_flagged === true}
            postId={post.id}
            images={(post.images ?? []).map(image => ({
              imageId: image.image_id,
              caption: image.caption,
            }))}
            thumbnails={(post.images ?? []).map((image, index) => (
              <PostImage
                key={image.image_id}
                imageId={image.image_id}
                width={1200}
                height={1200}
                alt={image.caption || heading}
                className='max-h-[60vh] w-auto rounded-md object-contain'
                priority={index === 0}
              />
            ))}
          />
        )}

        {/* Link post embed */}
        {post.post_type === 'link' && linkEmbed && (!isRejected || isStaffViewer) && (
          <LinkPostMedia
            embed={linkEmbed}
            view='detail'
          />
        )}

        {/* Content */}
        <div data-pw='post-detail-content'>
          {isRejected ? (
            isOwner ? (
              <ContentRemovedNotice reason={post.clearance_reason} />
            ) : isStaffViewer ? (
              <>
                <Badge
                  variant='secondary'
                  className='mb-2 text-xs'
                  data-pw='post-detail-review-badge'
                >
                  {labels.underReview}
                </Badge>
                <MarkdownContent
                  html={html}
                  className='prose prose-sm max-w-none dark:prose-invert'
                  features={MARKDOWN_CONTENT_FEATURES_RICH_EAGER}
                  lang={contentLanguage}
                />
              </>
            ) : (
              <ContentUnavailableNotice />
            )
          ) : (
            <MarkdownContent
              html={html}
              className='prose prose-sm max-w-none dark:prose-invert'
              features={MARKDOWN_CONTENT_FEATURES_RICH_EAGER}
              lang={contentLanguage}
            />
          )}
        </div>

        <PostDetailMetadata
          authorName={authorName}
          author={post.created_by}
          createdAt={post.created_at}
          bylineLabel={labels.postedBy(authorName)}
          separatorLabel={labels.metadataSeparator}
        />

        <PostDetailActions
          election={
            election
              ? {
                  id: election.id,
                  votesCountUp: election.votes_count_up ?? 0,
                  votesCountDown: election.votes_count_down ?? 0,
                }
              : undefined
          }
          existingVoteChoice={existingVoteChoice}
          hideDownCount={hideDownCount}
          post={{
            id: post.id,
            postType: post.post_type,
            canDiscussInCommunity,
            discussionSource: canDiscussInCommunity
              ? {
                  title: post.title,
                  canonicalPath: getCanonicalPostPath(post),
                }
              : undefined,
          }}
          initialSaved={initialSaved}
          initialHidden={initialHidden}
        />
      </div>
    </Card>
  )
}
