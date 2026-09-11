'use client'

import { Button } from '@/components/ui/button'
import type { ManageSourceRssFeed } from './manage-source-model'
import { useTranslations } from '@/lib/i18n/use-translations'

export function FeedActionsSection({
  confirmDelete,
  deleting,
  onConfirmDeleteChange,
  onDelete,
  onRefresh,
  onToggle,
  onToggleDiscoverability,
  refreshing,
  rssFeed,
  toggling,
  togglingDiscoverability,
}: {
  confirmDelete: boolean
  deleting: boolean
  onConfirmDeleteChange: (confirmDelete: boolean) => void
  onDelete: () => void
  onRefresh: () => void
  onToggle: () => void
  onToggleDiscoverability: () => void
  refreshing: boolean
  rssFeed: ManageSourceRssFeed
  toggling: boolean
  togglingDiscoverability: boolean
}) {
  const t = useTranslations()
  return (
    <section className='bg-card p-6 shadow-sm dark:shadow-none sm:rounded-lg'>
      <h2 className='mb-4 text-xl font-semibold text-foreground'>
        {t('extracted.manageSource.feedActionsSection.actions_ff8059dc')}
      </h2>
      <div className='flex flex-wrap items-center gap-3'>
        <Button
          type='button'
          variant='secondary'
          onClick={onToggle}
          disabled={toggling}
          // oxlint-disable-next-line no-mistakes/playwright-literals -- conditional button based on state
          data-pw={rssFeed.is_enabled ? 'feed-disable' : 'feed-enable'}
        >
          {rssFeed.is_enabled
            ? t('extracted.manageSource.feedActionsSection.disable_b7e3e4aa')
            : t('extracted.manageSource.feedActionsSection.enable_5342e09f')}
        </Button>
        <Button
          type='button'
          variant={rssFeed.is_discoverable ? 'secondary' : 'destructive'}
          onClick={onToggleDiscoverability}
          disabled={togglingDiscoverability}
          title={t(
            'extracted.manageSource.feedActionsSection.whenHiddenFromDiscoveryItemsFrom_77cd310f',
          )}
          // oxlint-disable-next-line no-mistakes/playwright-literals -- conditional button based on state
          data-pw={rssFeed.is_discoverable ? 'feed-hide-discovery' : 'feed-make-discoverable'}
        >
          {rssFeed.is_discoverable
            ? t('extracted.manageSource.feedActionsSection.hideFromDiscovery_c2075b95')
            : t('extracted.manageSource.feedActionsSection.makeDiscoverable_f4310831')}
        </Button>
        <Button
          type='button'
          variant='secondary'
          onClick={onRefresh}
          loading={refreshing}
          disabled={refreshing}
        >
          {refreshing
            ? t('extracted.manageSource.feedActionsSection.crawling_6fdd1cf2')
            : t('extracted.manageSource.feedActionsSection.triggerCrawl_cc44cd52')}
        </Button>
        <DeleteControls
          confirmDelete={confirmDelete}
          deleting={deleting}
          onConfirmDeleteChange={onConfirmDeleteChange}
          onDelete={onDelete}
        />
      </div>
    </section>
  )
}

function DeleteControls({
  confirmDelete,
  deleting,
  onConfirmDeleteChange,
  onDelete,
}: {
  confirmDelete: boolean
  deleting: boolean
  onConfirmDeleteChange: (confirmDelete: boolean) => void
  onDelete: () => void
}) {
  const t = useTranslations()
  if (!confirmDelete) {
    return (
      <Button
        type='button'
        variant='destructive'
        data-pw='feed-delete'
        onClick={() => onConfirmDeleteChange(true)}
      >
        {t('extracted.manageSource.feedActionsSection.delete_e2d0a549')}
      </Button>
    )
  }
  return (
    <div
      data-pw='feed-delete-confirm-row'
      className='flex items-center gap-2'
    >
      <span className='text-sm text-foreground'>
        {t('extracted.manageSource.feedActionsSection.areYouSure_f0762c4f')}
      </span>
      <Button
        type='button'
        variant='destructive'
        data-pw='feed-delete-confirm'
        onClick={onDelete}
        loading={deleting}
        disabled={deleting}
      >
        {deleting
          ? t('extracted.manageSource.feedActionsSection.deleting_685ecb98')
          : t('extracted.manageSource.feedActionsSection.confirmDelete_a7f54311')}
      </Button>
      <Button
        type='button'
        variant='secondary'
        onClick={() => onConfirmDeleteChange(false)}
      >
        {t('extracted.manageSource.feedActionsSection.cancel_19766ed6')}
      </Button>
    </div>
  )
}
