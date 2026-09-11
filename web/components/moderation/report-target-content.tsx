'use client'

import { PostContentText } from '@/components/posts/post-content-text'
import type { ModerationReportTargetContent } from '@/lib/api/client/reports-contracts'
import { useTranslations } from '@/lib/i18n/use-translations'

export function ReportTargetContent({
  fallback,
  targetContent,
}: {
  fallback: string
  targetContent: ModerationReportTargetContent | null
}) {
  const t = useTranslations()
  if (!targetContent) return fallback
  return (
    <>
      {targetContent.kind === 'comment'
        ? t('extracted.comments.commentPermalink.commentOnTitle_02b6af38', { title: '' })
        : null}
      <PostContentText
        as='span'
        content={targetContent}
      />
    </>
  )
}
