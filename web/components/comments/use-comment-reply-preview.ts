'use client'

import { useEffect, useState } from 'react'
import { previewMarkdown } from '@/lib/api/client/markdown'
import type { useTranslations } from '@/lib/i18n/use-translations'

export function useCommentReplyPreview(
  showPreview: boolean,
  markdown: string,
  t: ReturnType<typeof useTranslations>,
) {
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  useEffect(() => {
    if (!showPreview) return undefined
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setPreviewLoading(true)
      previewMarkdown(markdown, { signal: controller.signal })
        .then(({ html }) => setPreviewHtml(html))
        .catch((err: unknown) => {
          if (!(err instanceof DOMException && err.name === 'AbortError')) {
            setPreviewHtml(
              `<p class="text-sm text-muted-foreground">${t('extracted.comments.commentReplyForm.previewUnavailableTryAgain_7ece44e2')}</p>`,
            )
          }
        })
        .finally(() => setPreviewLoading(false))
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
      queueMicrotask(() => setPreviewLoading(false))
    }
  }, [showPreview, markdown, t])
  return { previewHtml, previewLoading }
}
