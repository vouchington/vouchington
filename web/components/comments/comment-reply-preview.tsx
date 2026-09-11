'use client'

import { MarkdownContent } from '@/components/shared/markdown-content'
import { MARKDOWN_CONTENT_FEATURES_RICH } from '@/components/shared/markdown-content-features'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  previewHtml: string
  previewLoading: boolean
}

export function CommentReplyPreview({ previewHtml, previewLoading }: Props) {
  const t = useTranslations()
  return (
    <div className='min-h-[4rem] rounded-md border bg-muted/30 p-3'>
      {previewLoading ? (
        <p className='text-sm text-muted-foreground'>
          {t('extracted.comments.commentReplyPreview.loadingPreview_c4cf2b2c')}
        </p>
      ) : previewHtml ? (
        <MarkdownContent
          html={previewHtml}
          className='prose prose-sm max-w-none dark:prose-invert'
          features={MARKDOWN_CONTENT_FEATURES_RICH}
        />
      ) : (
        <p className='text-sm text-muted-foreground'>
          {t('extracted.comments.commentReplyPreview.nothingToPreviewYet_75f00def')}
        </p>
      )}
    </div>
  )
}
