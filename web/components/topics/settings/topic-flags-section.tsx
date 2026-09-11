'use client'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useTranslations } from '@/lib/i18n/use-translations'

/**
 * Per-topic policy flags (see docs/requirements/content/TOPICS.md § Policy flags):
 * - `noindex` excludes the topic's pages from search-engine indexing.
 * - `allow_reviews` (when false) blocks review creation and hides review UI — used for
 *   private individuals. These flags replaced the former `person` topic type.
 */
export function TopicFlagsSection({
  noindex,
  allowReviews,
  onFlagsSubmit,
  setNoindex,
  setAllowReviews,
  flagsSaving,
}: {
  noindex: boolean
  allowReviews: boolean
  onFlagsSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  setNoindex: (noindex: boolean) => void
  setAllowReviews: (allowReviews: boolean) => void
  flagsSaving: boolean
}) {
  const t = useTranslations()
  return (
    <section
      data-pw='topic-flags-section'
      className='bg-card p-6 shadow-sm dark:shadow-none sm:rounded-lg'
    >
      <h2
        data-pw='topic-flags-heading'
        className='mb-4 text-xl font-semibold text-foreground'
      >
        {t('extracted.settings.topicFlagsSection.visibility_7448611d')}
      </h2>
      <form
        onSubmit={onFlagsSubmit}
        className='space-y-4'
      >
        <div className='flex items-center gap-2'>
          <Checkbox
            id='topic_noindex'
            data-pw='topic-noindex'
            checked={noindex}
            onCheckedChange={(checked: boolean | 'indeterminate') => setNoindex(checked === true)}
          />
          <Label htmlFor='topic_noindex'>
            {t('extracted.settings.topicFlagsSection.excludeFromSearchEnginesNoindex_5dbd3c4b')}
          </Label>
        </div>
        <div className='flex items-center gap-2'>
          <Checkbox
            id='topic_allow_reviews'
            data-pw='topic-allow-reviews'
            checked={allowReviews}
            onCheckedChange={(checked: boolean | 'indeterminate') =>
              setAllowReviews(checked === true)
            }
          />
          <Label htmlFor='topic_allow_reviews'>
            {t('extracted.settings.topicFlagsSection.allowReviews_7743b469')}
          </Label>
        </div>
        <Button
          type='submit'
          data-pw='save-topic-flags'
          loading={flagsSaving}
          disabled={flagsSaving}
        >
          {flagsSaving
            ? t('extracted.settings.topicFlagsSection.saving_dc85af8f')
            : t('extracted.settings.topicFlagsSection.saveVisibility_d94a5634')}
        </Button>
      </form>
    </section>
  )
}
