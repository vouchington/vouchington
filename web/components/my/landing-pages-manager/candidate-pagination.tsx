import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'

export function CandidatePagination({
  loading,
  error,
  onLoadMore,
}: {
  loading: boolean
  error: boolean
  onLoadMore: () => void
}) {
  const t = useTranslations()
  return (
    <div className='space-y-2'>
      <p className='text-xs text-muted-foreground'>
        {t('extracted.landingPagesManager.itemPicker.moreCandidatesHint')}
      </p>
      <Button
        type='button'
        variant='outline'
        onClick={onLoadMore}
        disabled={loading}
      >
        {error
          ? t('extracted.landingPagesManager.itemPicker.retryCandidates')
          : t('extracted.landingPagesManager.itemPicker.loadMoreCandidates')}
      </Button>
      {error ? (
        <p role='alert'>{t('extracted.landingPagesManager.itemPicker.candidatesError')}</p>
      ) : null}
    </div>
  )
}
