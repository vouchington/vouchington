'use client'

import { ViewModeDropdown } from '@/components/shared/view-mode-dropdown'
import { useFeedStyle } from '@/lib/preferences/use-feed-style'
import { useTranslations } from '@/lib/i18n/use-translations'

export function FeedViewToggle() {
  const { feedStyle, setFeedStyle } = useFeedStyle()
  const t = useTranslations()

  return (
    <ViewModeDropdown
      value={feedStyle}
      onValueChange={setFeedStyle}
      dataPw='feed-view-toggle-trigger'
      options={[
        {
          label: t('extracted.feed.feedViewToggle.card_be3702e3'),
          value: 'summary',
          icon: 'card',
          dataPw: 'feed-view-toggle-summary',
        },
        {
          label: t('extracted.feed.feedViewToggle.compact_99452646'),
          value: 'compact',
          icon: 'compact',
          dataPw: 'feed-view-toggle-compact',
        },
      ]}
    />
  )
}
