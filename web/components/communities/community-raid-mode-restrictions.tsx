'use client'

import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'
import { CommunityRaidModeActiveList } from './community-raid-mode-active-list'
import type { useCommunityRestrictionPages } from './use-community-restriction-pages'

interface Props {
  pages: ReturnType<typeof useCommunityRestrictionPages>
  liftingId: string | null
  isBusy: boolean
  onLift: (id: string) => void
}

export function CommunityRaidModeRestrictions({ pages, liftingId, isBusy, onLift }: Props) {
  const t = useTranslations()
  return (
    <>
      <div
        role='tablist'
        aria-label={t('moderation.restrictions.status')}
      >
        {(['active', 'past'] as const).map(status => (
          <Button
            type='button'
            key={status}
            role='tab'
            aria-selected={pages.status === status}
            variant={pages.status === status ? 'default' : 'outline'}
            disabled={pages.isLoading}
            onClick={async () => pages.load(status)}
          >
            {t(
              status === 'active'
                ? 'moderation.restrictions.active'
                : 'moderation.restrictions.past',
            )}
          </Button>
        ))}
      </div>
      <CommunityRaidModeActiveList
        restrictions={pages.restrictions}
        status={pages.status}
        liftingId={liftingId}
        isBusy={isBusy}
        onLift={onLift}
      />
      {pages.visibleData.page_info.has_next_page && pages.visibleData.page_info.end_cursor && (
        <Button
          variant='outline'
          loading={pages.isLoading}
          onClick={async () => pages.load(pages.status, pages.visibleData.page_info.end_cursor!)}
        >
          {t('moderation.restrictions.loadMore')}
        </Button>
      )}
    </>
  )
}
