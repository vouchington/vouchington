'use client'

import { CommandItem } from '@/components/ui/command'
import { useTranslations } from '@/lib/i18n/use-translations'

export function PostContinuationItem({
  onLoadMore,
  loading,
  hasError,
}: {
  onLoadMore: () => void | Promise<void>
  loading: boolean
  hasError: boolean
}) {
  const t = useTranslations()
  return (
    <CommandItem
      disabled={loading}
      onSelect={onLoadMore}
    >
      {hasError
        ? t('extracted.shared.paginatedListFooter.retry_942087cc')
        : loading
          ? t('extracted.shared.paginatedListFooter.loading_ba3bbbe1')
          : t('extracted.shared.paginatedListFooter.loadMore_ac8991ef')}
    </CommandItem>
  )
}
