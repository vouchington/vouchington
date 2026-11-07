import { Suspense } from 'react'
import { notFound } from 'next/navigation'

import { PageWithAside } from '@/components/page-with-aside'
import { PostDetailAside } from '@/components/posts/post-detail-aside'
import { PostComments } from '@/components/posts/post-comments'
import { PostDetail } from '@/components/posts/post-detail'
import { PostDetailTabs } from '@/components/posts/post-detail-tabs'
import { ReviewReferralPrograms } from '@/components/posts/review-referral-programs'
import { ReviewDisputeEntry } from '@/components/disputes/review-dispute-entry'
import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { getPost, getPostDescendants } from '@/lib/api/server'
import { loadPostCommunityPinState } from '@/lib/routes/post-community-pin-state'
import { buildPostDetailMetadata } from '@/lib/routes/post-detail-metadata'
import { getTranslations } from '@/lib/i18n/get-translations'
import { canCurrentUserSeeDownvotes } from '@/lib/permissions/can-see-downvotes'
import { createExcerpt } from '@vouchington/utils/seo-metadata'
import { buildCommentsForSchema, buildInteractionStats } from '@/lib/seo/post-schema-helpers'
import { createPostSchema } from '@/lib/seo/post-schema'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { createBreadcrumbSchema } from '@/lib/seo/structured-data-breadcrumbs'
import { buildPlacementImagePath } from '@/lib/utils/image-url'
import { getSchemaOrgType } from '@/lib/seo/schema-org-types'
import { communityHref, topicHref, userHref } from '@/lib/links/entity-href'
import {
  getPostCollectionLabel,
  getPostCollectionPath,
  getPostPath,
  getPostSchemaKind,
  getPostTitle,
} from '@/lib/post-helpers'
import type { PostType } from '@/types/posts'

type DetailPageProps = { params: Promise<{ id: string }> }

export function createPostDetailPage(postType: PostType, slug: string) {
  async function generateMetadata({ params }: DetailPageProps) {
    const { id } = await params
    return buildPostDetailMetadata({ id, postType, slug })
  }

  async function PostDetailRoutePage({ params }: DetailPageProps) {
    const { id } = await params
    const postResponse = await getPost(id)
    if (!postResponse) notFound()
    const post = postResponse.post
    if (post.post_type !== postType) notFound()
    const schemaKind = getPostSchemaKind(slug)
    const isDiscussionPost = schemaKind === 'discussion' || schemaKind === 'data-point'
    const firstRating = post.review_topic_ratings?.[0]
    const postCommunity = post.community_id
      ? (postResponse.communities?.[post.community_id] ?? post.community)
      : null
    const [descendants, pinState, t] = await Promise.all([
      getPostDescendants(id),
      loadPostCommunityPinState(postCommunity ?? null),
      getTranslations(),
    ])
    const { currentUser, communityData, pinnedPostsData } = pinState
    const communityViewerRole =
      communityData?.membership?.removed_at == null ? communityData?.membership?.role : null
    const isCommunityMod =
      (communityViewerRole === 'owner' ||
        communityViewerRole === 'moderator' ||
        (currentUser?.roles.includes('administrator') ?? false)) &&
      communityData != null &&
      communityData.community.archived_at == null
    const pinnedPostIds = pinnedPostsData?.pinned_posts.map(p => p.post_id) ?? []
    const isPostPinned = postCommunity != null && pinnedPostIds.includes(post.id)
    const metrics = postResponse.post_metrics
    const election = postResponse.post_election
    const electionVote = postResponse.election_vote
    const authorAside = postResponse.author_aside ?? null
    const reviewedTopics =
      postType === 'review'
        ? (post.review_topic_ratings ?? []).flatMap(r => (r.topic ? [r.topic] : []))
        : []
    const primaryTopic = post.post_related_topics?.[0]
    // Community posts root at the community crumb (not the Posts intent);
    // use intentCrumbOverride so the community occupies the intent slot and
    // Home is still prepended for anonymous visitors.
    const breadcrumbItems = buildBreadcrumbsForPath(getPostPath(slug, post), {
      intentCrumbOverride: postCommunity
        ? { name: postCommunity.name, path: communityHref(postCommunity) }
        : undefined,
      isAuthenticated: !!currentUser,
      userRoles: currentUser?.roles ?? [],
      tail: [
        ...(postCommunity
          ? []
          : primaryTopic
            ? [
                {
                  name: primaryTopic.name,
                  path: topicHref(primaryTopic),
                },
              ]
            : []),
        { name: getPostCollectionLabel(slug), path: getPostCollectionPath(slug) },
        { name: getPostTitle(post), path: getPostPath(slug, post) },
      ],
    })
    return (
      <PageWithAside
        aside={
          <PostDetailAside
            t={t}
            post={post}
            authorAside={authorAside}
            hackerNewsReferences={postResponse.post_hacker_news_references?.[post.id]}
          />
        }
        showFooter={false}
      >
        <div className='space-y-4'>
          <AnonymousStructuredDataScript
            data={createPostSchema({
              kind: schemaKind,
              title: getPostTitle(post),
              description: createExcerpt(postResponse.html ?? post.markdown),
              path: getPostPath(slug, post),
              createdAt: post.created_at,
              updatedAt: post.updated_at,
              authorName: post.is_anonymous ? undefined : post.created_by?.username,
              authorUrl: post.created_by ? userHref(post.created_by) : undefined,
              imagePath: buildPlacementImagePath(post.images?.[0]),
              reviewRating: firstRating?.rating,
              itemName: firstRating?.topic?.name ?? primaryTopic?.name,
              comments: isDiscussionPost ? buildCommentsForSchema(descendants) : undefined,
              interactionStats: buildInteractionStats(election, metrics),
              itemReviewedType: firstRating?.category_slug
                ? getSchemaOrgType([firstRating.category_slug])
                : undefined,
            })}
          />
          {breadcrumbItems.length > 0 && (
            <AnonymousStructuredDataScript data={createBreadcrumbSchema(breadcrumbItems, t)} />
          )}
          <Breadcrumbs items={breadcrumbItems} />
          <PostDetail
            post={post}
            election={election}
            existingVoteChoice={electionVote?.choice}
            html={postResponse.html}
            hideDownCount={!canCurrentUserSeeDownvotes(currentUser)}
            initialSaved={postResponse.bookmarks?.[post.id]?.save ?? false}
            initialHidden={postResponse.bookmarks?.[post.id]?.hide ?? false}
            community={postCommunity}
            isCommunityMod={isCommunityMod}
            isPostPinned={isPostPinned}
            linkEmbed={postResponse.link_embed}
          />
          <ReviewReferralPrograms
            t={t}
            post={post}
          />
          {currentUser != null && reviewedTopics.length > 0 && (
            <Suspense fallback={null}>
              <ReviewDisputeEntry
                postId={post.id}
                reviewedTopics={reviewedTopics}
              />
            </Suspense>
          )}
          <PostDetailTabs
            activeTab='comments'
            commentCount={metrics?.count.descendants ?? 0}
            postType={slug}
            postId={post.id}
            isAuthenticated={!!currentUser}
          />
          <PostComments
            data={descendants}
            rootPostId={post.id}
            rootPostType={slug}
            rootLockedAt={post.locked_at ?? null}
            isAdmin={currentUser?.roles.includes('administrator') ?? false}
            hideDownCount={!canCurrentUserSeeDownvotes(currentUser)}
          />
        </div>
      </PageWithAside>
    )
  }
  return { generateMetadata, default: PostDetailRoutePage }
}
