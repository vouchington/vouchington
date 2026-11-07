import { Badge } from '@/components/ui/badge'
import { MARKDOWN_CONTENT_FEATURES_RICH_EAGER } from '@/components/shared/markdown-content-features'
import { MarkdownContent } from '@/components/shared/markdown-content'
import { PostImage } from '@/components/shared/post-image'
import type { DataPointVertical } from '@voucha/types/entities/data-point'
import type { Post } from '@/types/posts'
import type { PostResponseBody } from '@/types/api-responses'
import { ContentRemovedNotice } from '@/components/moderation/notices/content-removed-notice'
import { ContentUnavailableNotice } from '@/components/moderation/notices/content-unavailable-notice'
import { DataPointDetail } from './data-point-detail'
import { LinkPostMedia } from './link-post-media'
import { PostDetailImages } from './post-detail-images'
import { getPostDetailTitle } from './post-detail-title'

export function PostDetailBody({
  post,
  html,
  labels,
  isOwner,
  isAdmin,
  isModerator,
  isCommunityMod,
  linkEmbed,
}: {
  post: Post
  html: string
  labels: {
    underReview: string
    dataPoint: { creditCard: string; bankAccount: string }
  }
  isOwner: boolean
  isAdmin: boolean
  isModerator?: boolean
  isCommunityMod?: boolean
  linkEmbed?: PostResponseBody['link_embed']
}) {
  const { heading, contentLanguage } = getPostDetailTitle(post)
  const isRejected = post.clearance_status === 'rejected'
  const isStaffViewer = isAdmin || !!isModerator || isCommunityMod === true

  return (
    <>
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
          isSensitive={
            post.clearance_status === 'rejected' || post.clearance_status === 'in_review'
          }
          postId={post.id}
          images={(post.images ?? []).map(image => ({
            imageId: image.image_id,
            placementId: image.placement_id,
            placementRevision: image.placement_revision,
            caption: image.caption,
          }))}
          thumbnails={(post.images ?? []).map((image, index) => (
            <PostImage
              key={image.image_id}
              imageId={image.image_id}
              placement={{ id: image.placement_id, revision: image.placement_revision }}
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
    </>
  )
}
