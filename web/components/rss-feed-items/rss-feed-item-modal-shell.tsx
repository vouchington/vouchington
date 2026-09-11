/* eslint-disable react-doctor/prefer-use-effect-event */
'use client'

import { Suspense, type ReactNode, useCallback, useEffect, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useRssItemNav } from '@/lib/rss-item-nav-context'
import { RSS_ITEM_HIDDEN_EVENT, RSS_ITEM_PARAM } from '@/lib/rss-item-modal'
import { RssFeedItemModalFooter } from './rss-feed-item-modal-footer'
import { RssFeedItemModalHeader } from './rss-feed-item-modal-header'
import { createScrollNavKeyHandler } from './rss-feed-item-modal-shell-keydown'
import { useScrollCurrentRssItemIntoView } from './rss-feed-item-modal-shell-current-item-scroll'

interface RssFeedItemModalShellProps {
  actions?: ReactNode
  children: ReactNode
  closeUrl: string
  currentItemId: string
  headerDetails?: ReactNode
  nextUrl?: string | null
  previousUrl?: string | null
  title: string
  titleUrl?: string
}

export function RssFeedItemModalShell(props: RssFeedItemModalShellProps) {
  return (
    <Suspense fallback={null}>
      <RssFeedItemModalShellContent {...props} />
    </Suspense>
  )
}

function RssFeedItemModalShellContent({
  actions,
  children,
  closeUrl,
  currentItemId,
  headerDetails,
  nextUrl,
  previousUrl,
  title,
  titleUrl,
}: RssFeedItemModalShellProps) {
  const t = useTranslations()
  const { push } = useRouter()
  const pathname = usePathname()
  const currentSearchParams = useSearchParams()
  const navContext = useRssItemNav()
  const previousButtonRef = useRef<HTMLButtonElement>(null)
  const nextButtonRef = useRef<HTMLButtonElement>(null)
  const pendingFocusDirectionRef = useRef<'previous' | 'next' | null>(null)
  const pendingAdvanceRef = useRef(false)
  const prevLoadingMoreRef = useRef(false)
  function buildNavUrl(itemId: string): string {
    const params = new URLSearchParams(currentSearchParams?.toString() ?? '')
    params.delete('rss_item_nav')
    params.set(RSS_ITEM_PARAM, itemId)
    return `${pathname}?${params.toString()}`
  }
  let effectivePreviousUrl: string | null | undefined = previousUrl
  let effectiveNextUrl: string | null | undefined = nextUrl
  if (navContext) {
    const ids = navContext.orderedItemIds
    const idx = ids.indexOf(currentItemId)
    if (idx !== -1) {
      effectivePreviousUrl = idx > 0 ? buildNavUrl(ids[idx - 1]!) : null
      effectiveNextUrl = idx < ids.length - 1 ? buildNavUrl(ids[idx + 1]!) : null
    } else {
      effectivePreviousUrl = null
      effectiveNextUrl = null
    }
  }
  const atEnd = navContext?.orderedItemIds.at(-1) === currentItemId
  useScrollCurrentRssItemIntoView(currentItemId)
  useEffect(() => {
    const dir = pendingFocusDirectionRef.current
    if (!dir) return
    pendingFocusDirectionRef.current = null
    const id = requestAnimationFrame(() => {
      if (dir === 'previous') previousButtonRef.current?.focus()
      else nextButtonRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [currentItemId])

  const navigatePrevious = useCallback(() => {
    if (!effectivePreviousUrl) return false
    pendingAdvanceRef.current = false
    pendingFocusDirectionRef.current = 'previous'
    previousButtonRef.current?.focus()
    push(effectivePreviousUrl, { scroll: false })
    return true
  }, [effectivePreviousUrl, push])

  const navigateNext = useCallback(() => {
    if (effectiveNextUrl) {
      pendingAdvanceRef.current = false
      pendingFocusDirectionRef.current = 'next'
      nextButtonRef.current?.focus()
      push(effectiveNextUrl, { scroll: false })
      return true
    }
    if (pendingAdvanceRef.current) return true
    if (navContext?.hasNextPage && atEnd) {
      pendingAdvanceRef.current = true
      void navContext.loadMore()
      return true
    }
    return false
  }, [effectiveNextUrl, push, navContext, atEnd])

  const navigateClose = useCallback(() => {
    push(closeUrl, { scroll: false })
  }, [closeUrl, push])
  useEffect(() => {
    const wasLoading = prevLoadingMoreRef.current
    prevLoadingMoreRef.current = !!navContext?.loadingMore
    if (!pendingAdvanceRef.current) return
    if (effectiveNextUrl) navigateNext()
    else if (!navContext?.hasNextPage || (wasLoading && !navContext?.loadingMore))
      pendingAdvanceRef.current = false
  }, [effectiveNextUrl, navContext?.hasNextPage, navContext?.loadingMore, navigateNext])

  // When focus is inside the article, Up/Down scroll natively. Outside it, they navigate.
  useEffect(() => {
    const onKeyDown = createScrollNavKeyHandler({ navigatePrevious, navigateNext })
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigatePrevious, navigateNext])

  useEffect(() => {
    function onItemHidden(event: Event) {
      if (!(event instanceof CustomEvent) || typeof event.detail?.id !== 'string') return
      if (event.detail.id !== currentItemId) return
      if (!effectiveNextUrl || !navigateNext()) navigateClose()
    }
    window.addEventListener(RSS_ITEM_HIDDEN_EVENT, onItemHidden)
    return () => window.removeEventListener(RSS_ITEM_HIDDEN_EVENT, onItemHidden)
  }, [currentItemId, effectiveNextUrl, navigateNext, navigateClose])

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) navigateClose()
      }}
    >
      <DialogContent
        className='grid max-h-[85vh] w-[calc(100vw-1rem)] max-w-4xl min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-3 sm:w-[calc(100vw-2rem)] sm:p-4'
        data-pw='rss-feed-item-modal'
      >
        <DialogDescription className='sr-only'>
          {t('extracted.rssFeedItems.rssFeedItemModalHeader.rssItemDetail_110656e4')}
        </DialogDescription>
        <RssFeedItemModalHeader
          headerDetails={headerDetails}
          title={title}
          titleUrl={titleUrl}
        />
        <ScrollArea className='min-h-0 min-w-0'>{children}</ScrollArea>
        <RssFeedItemModalFooter
          actions={actions}
          canNavigateNext={!!(effectiveNextUrl || (atEnd && navContext?.hasNextPage))}
          canNavigatePrevious={!!effectivePreviousUrl}
          navigateNext={navigateNext}
          navigatePrevious={navigatePrevious}
          nextButtonRef={nextButtonRef}
          previousButtonRef={previousButtonRef}
        />
      </DialogContent>
    </Dialog>
  )
}
