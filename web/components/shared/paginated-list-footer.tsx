'use client'

import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'

interface PaginatedListFooterProps {
  mode?: 'continuation' | 'retry-only'
  fetchError: Error | null
  canLoadMore: boolean
  loadingMore: boolean
  clearError: () => void
  loadMore: () => void | Promise<void>
}

export function PaginatedListFooter({
  mode = 'continuation',
  fetchError,
  canLoadMore,
  loadingMore,
  clearError,
  loadMore,
}: PaginatedListFooterProps) {
  const t = useTranslations()
  if (!canLoadMore || (mode === 'retry-only' && !fetchError)) return null
  const buttonLabel = fetchError
    ? t('extracted.shared.paginatedListFooter.retry_942087cc')
    : loadingMore
      ? t('extracted.shared.paginatedListFooter.loading_ba3bbbe1')
      : t('extracted.shared.paginatedListFooter.loadMore_ac8991ef')

  return (
    <div
      data-pw='paginated-list-continuation'
      className='flex flex-col items-center gap-2 py-4'
    >
      {fetchError && (
        <p
          data-pw='paginated-list-retry'
          className='text-sm text-destructive'
          role='alert'
          aria-live='assertive'
        >
          {t('extracted.shared.paginatedListFooter.failedToLoadMore_e1499d61')}
        </p>
      )}
      <Button
        variant='outline'
        size='sm'
        disabled={loadingMore}
        onClick={() => {
          if (fetchError) clearError()
          void loadMore()
        }}
      >
        {buttonLabel}
      </Button>
    </div>
  )
}
