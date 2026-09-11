import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { PostDetail } from '@/components/posts/post-detail'
import { PostDetailAside } from '@/components/posts/post-detail-aside'
import { PostDetailTabs } from '@/components/posts/post-detail-tabs'
import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { ManageTagsTabs } from '@/components/tags/manage-tags-tabs'
import { AsideColumn } from '@/components/aside-column'
import { AsideDrawer } from '@/components/aside-drawer'
import { ContentContainer } from '@/components/layout/content-container'
import { postTagTabs } from '@/components/tags/tag-relation-configs'
import { getPostPath, getPostTitle } from '@/lib/post-helpers'
import { createBreadcrumbSchema } from '@/lib/seo/structured-data'
import { communityHref } from '@/lib/links/entity-href'
import type { PostResponseBody } from '@/types/api-responses'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'

interface ManagePostTagsProps {
  postData: PostResponseBody
  hideDownCount: boolean
  slug: string
  objectType: string
}

export function ManagePostTags({ postData, hideDownCount, slug, objectType }: ManagePostTagsProps) {
  const post = postData.post
  const postPath = getPostPath(slug, post)
  const postCommunity = post.community_id
    ? (postData.communities?.[post.community_id] ?? post.community ?? null)
    : null
  const breadcrumbItems = buildBreadcrumbsForPath(postPath, {
    isAuthenticated: true,
    tail: [
      { name: getPostTitle(post), path: postPath },
      { name: 'Tags', path: `${postPath}/manage-tags/${objectType}` },
    ],
    ...(postCommunity
      ? { intentCrumbOverride: { name: postCommunity.name, path: communityHref(postCommunity) } }
      : {}),
  })

  const postIdOrSlug = post.slug ?? post.id

  return (
    <>
      <AsideDrawer showFooter>
        <PostDetailAside
          post={post}
          authorAside={postData.author_aside ?? null}
          sourceUrls={[postData.link_embed?.source_url]}
        />
      </AsideDrawer>
      <ContentContainer
        className='flex flex-col lg:flex-row'
        data-pw='manage-post-tags-content'
      >
        <div className='min-w-0 flex-1'>
          <div className='space-y-4'>
            <AnonymousStructuredDataScript data={createBreadcrumbSchema(breadcrumbItems)} />
            <Breadcrumbs items={breadcrumbItems} />
            <PostDetail
              post={post}
              election={postData.post_election}
              existingVoteChoice={
                postData.election_vote?.choice as
                  | import('@/lib/api/client/elections').SentimentChoice
                  | undefined
              }
              html={postData.html}
              hideDownCount={hideDownCount}
            />
            <PostDetailTabs
              activeTab='manage-tags'
              commentCount={postData.post_metrics?.count.descendants ?? 0}
              postType={slug}
              postId={postIdOrSlug}
              isAuthenticated
              activeTag={objectType}
            />
            <ManageTagsTabs
              entityType='post'
              entityId={post.id}
              tabs={postTagTabs}
              activeTab={objectType}
            />
          </div>
        </div>
        <AsideColumn showFooter>
          <PostDetailAside
            post={post}
            authorAside={postData.author_aside ?? null}
            sourceUrls={[postData.link_embed?.source_url]}
          />
        </AsideColumn>
      </ContentContainer>
    </>
  )
}
