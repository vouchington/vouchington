'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode, RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'

interface RssFeedItemModalFooterProps {
  actions?: ReactNode
  canNavigateNext?: boolean
  canNavigatePrevious?: boolean
  navigateNext: () => boolean
  navigatePrevious: () => boolean
  nextButtonRef: RefObject<HTMLButtonElement | null>
  previousButtonRef: RefObject<HTMLButtonElement | null>
}

export function RssFeedItemModalFooter({
  actions,
  canNavigateNext,
  canNavigatePrevious,
  navigateNext,
  navigatePrevious,
  nextButtonRef,
  previousButtonRef,
}: RssFeedItemModalFooterProps) {
  const t = useTranslations()
  return (
    <div className='grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 border-t pt-3'>
      <Button
        ref={previousButtonRef}
        type='button'
        variant='outline'
        size='touchIcon'
        aria-disabled={!canNavigatePrevious}
        disabled={!canNavigatePrevious}
        className='shrink-0 px-0 aria-disabled:pointer-events-none aria-disabled:opacity-50 sm:h-7 sm:w-auto sm:px-2.5'
        onClick={navigatePrevious}
        aria-label={t('extracted.rssFeedItems.rssFeedItemModalFooter.previous_a57b08a4')}
        data-pw='rss-feed-item-modal-previous-button'
      >
        <ChevronLeft className='h-4 w-4 sm:mr-1' />
        <span className='hidden sm:inline'>
          {t('extracted.rssFeedItems.rssFeedItemModalFooter.previous_a57b08a4')}
        </span>
      </Button>
      <div className='min-w-0 overflow-hidden'>{actions}</div>
      <Button
        ref={nextButtonRef}
        type='button'
        variant='outline'
        size='touchIcon'
        aria-disabled={!canNavigateNext}
        disabled={!canNavigateNext}
        className='shrink-0 px-0 aria-disabled:pointer-events-none aria-disabled:opacity-50 sm:h-7 sm:w-auto sm:px-2.5'
        onClick={navigateNext}
        aria-label={t('extracted.rssFeedItems.rssFeedItemModalFooter.next_1ff57a29')}
        data-pw='rss-feed-item-modal-next-button'
      >
        <span className='hidden sm:inline'>
          {t('extracted.rssFeedItems.rssFeedItemModalFooter.next_1ff57a29')}
        </span>
        <ChevronRight className='h-4 w-4 sm:ml-1' />
      </Button>
    </div>
  )
}
