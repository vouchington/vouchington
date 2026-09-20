/* oxlint-disable max-lines -- shared factory for all post-type detail pages; community pin data fetching pushes it over the limit */
import * as Sentry from '@sentry/nextjs'
import type { Metadata } from 'next'
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
import {
  getCommunity,
  getCommunityPinnedPosts,
  getPost,
  getPostDescendants,
} from '@/lib/api/server'
import { returnNullForMissingEntity } from '@/lib/api/return-null-for-missing-entity'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getTranslations } from '@/lib/i18n/get-translations'
import { canCurrentUserSeeDownvotes } from '@/lib/permissions/can-see-downvotes'
import { isIndexableForSeo } from '@/lib/seo/indexability'
import { createExcerpt, createNoIndexMetadata, createPageMetadata } from '@/lib/seo/metadata'
import { buildCommentsForSchema, buildInteractionStats } from '@/lib/seo/post-schema-helpers'
import { createPostSchema } from '@/lib/seo/post-schema'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { createBreadcrumbSchema } from '@/lib/seo/structured-data'
import { buildPlacementImagePath } from '@/lib/utils/image-url'
import { getSchemaOrgType } from '@/lib/seo/schema-org-types'
import { communityHref, topicHref, userHref } from '@/lib/links/entity-href'
import { getEffectiveContentLanguage } from '@ts-shared/languages/content-languages'
import {
  getPostCollectionLabel,
  getPostCollectionPath,
  getPostPath,
  getPostSchemaKind,
  getPostTitle,
  getVoteScoreNet,
} from '@/lib/post-helpers'
import type { PostType } from '@/types/posts'

type DetailPageProps = { params: Promise<{ id: string }> }

export function createPostDetailPage(postType: PostType, slug: string) {
  async function generateMetadata({ params }: DetailPageProps): Promise<Metadata> {
    const { id } = await params
    try {
      const postResponse = await getPost(id)
      if (!postResponse) return createNoIndexMetadata()
      const post = postResponse.post
      if (post.post_type !== postType) return createNoIndexMetadata()
      const voteScoreNet = getVoteScoreNet(postResponse)
      const isRestrictedAudience = post.privacy !== 'public' || post.broadcast !== 'everyone'
      const noIndex =
        isRestrictedAudience ||
        voteScoreNet === null ||
        !isIndexableForSeo(voteScoreNet) ||
        !!post.archived_at
      const canonicalPath = getPostPath(slug, post)
      return createPageMetadata({
        title: getPostTitle(post),
        description: createExcerpt(postResponse.html ?? post.markdown),
        path: canonicalPath,
        noIndex,
        imagePath: buildPlacementImagePath(post.images?.[0]),
        type: 'article',
        publishedTime: post.created_at,
        modifiedTime: post.updated_at,
        authors: post.created_by?.username ? [post.created_by.username] : undefined,
        contentLanguage: getEffectiveContentLanguage({
          declaredLanguage: post.declared_language,
          detectedLanguage: post.lingua_rs_detected_language,
        }),
      })
    } catch {
      return createNoIndexMetadata()
    }
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
    const currentUserPromise = getCurrentUser()
    const descendantsPromise = getPostDescendants(id)
    const communityDataPromise = currentUserPromise.then(user => {
      if (!postCommunity || !user) return null
      return returnNullForMissingEntity(getCommunity(postCommunity.slug), {
        nullStatusCodes: [403, 404],
      }).catch(error => {
        // Community data is auxiliary for pin eligibility — log 5xx but don't fail the page
        Sentry.captureException(error, { tags: { context: 'community-data-for-pin' } })
        return null
      })
    })
    const pinnedPostsPromise = currentUserPromise.then(user => {
      if (!postCommunity || !user) return null
      return returnNullForMissingEntity(getCommunityPinnedPosts(postCommunity.slug), {
        nullStatusCodes: [403, 404],
      }).catch(error => {
        // Pin state is auxiliary — log unexpected errors (5xx, network) but don't fail the page
        Sentry.captureException(error, { tags: { context: 'community-pinned-posts' } })
        return null
      })
    })

    const [descendants, currentUser, communityData, pinnedPostsData, t] = await Promise.all([
      descendantsPromise,
      currentUserPromise,
      communityDataPromise,
      pinnedPostsPromise,
      getTranslations(),
    ])
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
            sourceUrls={[postResponse.link_embed?.source_url]}
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
