'use client'

import { ViewModeDropdown } from '@/components/shared/view-mode-dropdown'
import { useListStyle } from '@/lib/preferences/use-list-style'
import { useTranslations } from '@/lib/i18n/use-translations'

export function PostViewToggle() {
  const { listStyle, setListStyle } = useListStyle()
  const t = useTranslations()

  return (
    <ViewModeDropdown
      value={listStyle}
      onValueChange={setListStyle}
      options={[
        {
          label: t('extracted.posts.postViewToggle.card_be3702e3'),
          value: 'card',
          icon: 'card',
          dataPw: 'post-view-toggle-card',
        },
        {
          label: t('extracted.posts.postViewToggle.compact_99452646'),
          value: 'compact',
          icon: 'compact',
          dataPw: 'post-view-toggle-compact',
        },
      ]}
    />
  )
}
