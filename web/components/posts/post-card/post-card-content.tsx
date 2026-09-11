'use client'

import { Badge } from '@/components/ui/badge'
import { MARKDOWN_CONTENT_FEATURES_UTM } from '@/components/shared/markdown-content-features'
import { MarkdownContent } from '@/components/shared/markdown-content'
import { PostContentText } from '@/components/posts/post-content-text'
import { generateExcerpt } from '@ts-shared/utils/format'
import { ContentRemovedNotice } from '@/components/moderation/notices/content-removed-notice'
import { ContentUnavailableNotice } from '@/components/moderation/notices/content-unavailable-notice'
import type { Post } from '@/types/posts'
import { useTranslations } from '@/lib/i18n/use-translations'

interface PostCardContentProps {
  post: Post
  html: string | undefined
  contentLanguage: string | undefined
  currentUserId: string | null
  isStaff: boolean
}

export function PostCardContent({
  post,
  html,
  contentLanguage,
  currentUserId,
  isStaff,
}: PostCardContentProps) {
  const t = useTranslations()
  const renderPlainTextExcerpt = () => (
    <PostContentText
      as='p'
      className='text-sm text-muted-foreground'
      content={{ text: generateExcerpt(post.markdown, 200), declared_language: contentLanguage }}
    />
  )
  if (post.clearance_status !== 'rejected') {
    return html ? (
      <MarkdownContent
        html={html}
        className='line-clamp-3 text-sm text-muted-foreground'
        features={MARKDOWN_CONTENT_FEATURES_UTM}
        lang={contentLanguage}
        preview
      />
    ) : (
      renderPlainTextExcerpt()
    )
  }

  if (currentUserId !== null && currentUserId === post.created_by_id) {
    return <ContentRemovedNotice reason={post.clearance_reason} />
  }

  if (isStaff) {
    return (
      <>
        <Badge
          variant='secondary'
          className='text-xs'
          data-pw='post-card-review-badge'
        >
          {t('extracted.postCard.postCardContent.underReview_9e8a3b64')}
        </Badge>
        {html ? (
          <MarkdownContent
            html={html}
            className='line-clamp-3 text-sm text-muted-foreground'
            features={MARKDOWN_CONTENT_FEATURES_UTM}
            lang={contentLanguage}
            preview
          />
        ) : (
          renderPlainTextExcerpt()
        )}
      </>
    )
  }

  return <ContentUnavailableNotice />
}
