'use client'

import { MARKDOWN_CONTENT_FEATURES_UTM } from '@/components/shared/markdown-content-features'
import { MarkdownContent } from '@/components/shared/markdown-content'
import { PostContentText } from '@/components/posts/post-content-text'
import { getEffectiveContentLanguage } from '@ts-shared/languages/content-languages'
import type { TopicRecommendationDialogProps } from './topic-recommendation-dialog-types'
import { useTranslations } from '@/lib/i18n/use-translations'

type SummaryProps = Pick<TopicRecommendationDialogProps, 'selected' | 'selectedHtml'>

export function TopicRecommendationDialogSummary({ selected, selectedHtml }: SummaryProps) {
  const t = useTranslations()
  if (!selected) return null
  return (
    <div className='rounded-lg border p-4'>
      <h3 className='mb-2 text-sm font-semibold'>
        {t(
          'extracted.topicRecommendations.topicRecommendationDialogSummary.recommendationRationale_fab3d4c4',
        )}
      </h3>
      {selectedHtml ? (
        <MarkdownContent
          html={selectedHtml}
          lang={getEffectiveContentLanguage({
            declaredLanguage: selected.declared_language,
            detectedLanguage: selected.lingua_rs_detected_language,
          })}
          className='text-sm text-muted-foreground'
          features={MARKDOWN_CONTENT_FEATURES_UTM}
        />
      ) : (
        <PostContentText
          as='p'
          className='text-sm text-muted-foreground'
          content={{
            text: selected.markdown,
            declared_language: selected.declared_language,
            lingua_rs_detected_language: selected.lingua_rs_detected_language,
          }}
        />
      )}
    </div>
  )
}
