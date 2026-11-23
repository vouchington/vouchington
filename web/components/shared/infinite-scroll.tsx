'use client'

/**
 * Infinite scroll component using Intersection Observer
 * Automatically loads next page when user scrolls near bottom
 */

import { useEffect, useRef } from 'react'
import { pageHasContinuation } from '@/lib/api/page-has-continuation'
import { PaginatedListFooter } from './paginated-list-footer'
import { useConsecutiveEmptyPages } from './use-consecutive-empty-pages'

/**
 * Empty-state switch shared by every paginated list: a short or empty page is not the end of
 * the list, so `emptyState` replaces the children only when nothing is loaded and no next page
 * can be requested. While a next page can still be requested, an empty list renders only the
 * sentinel so the page keeps loading.
 */
type EmptyStateProps =
  | { isEmpty: boolean; emptyState: React.ReactNode }
  | { isEmpty?: undefined; emptyState?: undefined }

type InfiniteScrollProps = EmptyStateProps & {
  hasNextPage: boolean
  endCursor: string | null
  onLoadMore: () => Promise<void | boolean>
  loadingMore?: boolean
  fetchError?: Error | null
  clearError?: () => void
  children: React.ReactNode
  /**
   * Reset key: when this value changes, the loaded-cursor guard is cleared so the
   * next page can be fetched again. Pass `pages[0]` from usePaginatedList so that
   * a filter/sort change (which replaces pages[0]) resets the guard automatically.
   */
  resetKey?: unknown
}

const NOOP_CLEAR_ERROR = () => undefined

export function InfiniteScroll({
  hasNextPage,
  endCursor,
  onLoadMore,
  loadingMore = false,
  fetchError = null,
  clearError = NOOP_CLEAR_ERROR,
  children,
  resetKey,
  isEmpty = false,
  emptyState,
}: InfiniteScrollProps) {
  const canContinue = pageHasContinuation({ has_next_page: hasNextPage, end_cursor: endCursor })
  const emptyPages = useConsecutiveEmptyPages(isEmpty, endCursor, resetKey)
  const observerRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)
  const attemptedCursorRef = useRef<string | null>(null)
  const requestLoadRef = useRef<(manual: boolean) => void>(() => undefined)
  // Bumped whenever resetKey changes so a stale request's completion (see below) can tell
  // it no longer belongs to the current query and must not re-stamp the guard.
  const resetGenerationRef = useRef(0)

  function requestLoad(manual: boolean) {
    const retryingFailure = manual && fetchError !== null
    if ((!hasNextPage || !endCursor) && !retryingFailure) return
    if (loadingMore || loadingRef.current) return
    if (attemptedCursorRef.current === endCursor && !retryingFailure) return
    // After MAX_CONSECUTIVE_EMPTY_PAGES empty pages only an explicit "Load more" continues.
    if (!manual && emptyPages.autoLoadPaused()) return
    if (manual) emptyPages.restart()

    loadingRef.current = true
    // Only stamp the guard once onLoadMore confirms it actually started a request — an
    // explicit `false` means it no-opped (e.g. a stale query token or an in-flight request
    // already owns this cursor), and the next trigger for this cursor must get a real attempt.
    const generationAtRequestStart = resetGenerationRef.current
    let loadStarted = true
    void onLoadMore()
      .then(started => {
        loadStarted = started !== false
      })
      .catch(console.error)
      .finally(() => {
        // A resetKey change between request start and completion means this result belongs
        // to a query that no longer exists — stamping now would resurrect the exact
        // coincidental-cursor stall the reset effect below exists to clear.
        if (loadStarted && resetGenerationRef.current === generationAtRequestStart) {
          attemptedCursorRef.current = endCursor
        }
        loadingRef.current = false
      })
  }

  useEffect(() => {
    requestLoadRef.current = requestLoad
  })

  // Reset the loaded-cursor guard when the caller signals a full reset (e.g. filter change).
  // Without this, a new initialData whose endCursor coincidentally matches the previously
  // loaded cursor would be silently skipped by the intersection observer.
  useEffect(() => {
    resetGenerationRef.current += 1
    attemptedCursorRef.current = null
  }, [resetKey])

  // Tracks whether the user has scrolled at least once. Used as a gate to prevent
  // the IO from loading the next page on initial render when the sentinel happens
  // to be in the viewport (e.g. story clustering reduces 25 raw items to ~6-10
  // visible clusters, leaving the sentinel just barely on-screen).
  const hasScrolledRef = useRef(false)

  useEffect(() => {
    if (!hasNextPage || !endCursor || !observerRef.current) return undefined

    const element = observerRef.current
    // An empty list has nothing to scroll, so the next page is requested without a scroll.
    if (isEmpty) hasScrolledRef.current = true
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]!.isIntersecting && !fetchError && hasScrolledRef.current) {
          requestLoadRef.current(false)
        }
      },
      { threshold: 0.1 },
    )

    // One-shot scroll listener: open the gate on first user scroll, then re-observe
    // so the IO callback fires immediately with the current intersection state.
    const onScroll = () => {
      hasScrolledRef.current = true
      window.removeEventListener('scroll', onScroll, true)
      observer.unobserve(element)
      observer.observe(element)
    }
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })

    // Defer observe() until after the next paint so the initial content has fully laid
    // out before we check intersection. Without this, observe() fires the callback on
    // the next microtask when the sentinel is already in the viewport — but this can
    // race with layout settling (e.g. story clustering reduces 25 items to ~6-10 visible
    // clusters, and the sentinel appears in-viewport before the full height is established).
    const rafId = requestAnimationFrame(() => {
      observer.observe(element)
      // If the document isn't scrollable after initial layout (content fits in the
      // viewport), the user can never emit a scroll event to open the gate. Open it
      // here so pagination still works for short result sets.
      if (document.documentElement.scrollHeight <= window.innerHeight) {
        hasScrolledRef.current = true
        window.removeEventListener('scroll', onScroll, true)
      }
    })

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('scroll', onScroll, true)
      observer.unobserve(element)
      observer.disconnect()
    }
    // resetKey is included so a filter/sort change re-observes even when hasNextPage,
    // endCursor, and fetchError are all unchanged (the coincidental-same-cursor case) —
    // observe() delivers a fresh intersection callback for the current DOM state, which is
    // the only thing that can retrigger a scroll-gated load once the guard above is cleared.
  }, [hasNextPage, endCursor, fetchError, resetKey, isEmpty])

  return (
    <>
      {isEmpty ? (!canContinue && !fetchError ? emptyState : null) : children}
      {(canContinue || fetchError) && (
        <div
          ref={observerRef}
          data-pw='infinite-scroll-sentinel'
        >
          <PaginatedListFooter
            fetchError={fetchError}
            canLoadMore={Boolean((hasNextPage && endCursor) || fetchError)}
            loadingMore={loadingMore}
            clearError={clearError}
            loadMore={() => requestLoad(true)}
            mode={hasNextPage && endCursor ? 'continuation' : 'retry-only'}
          />
        </div>
      )}
    </>
  )
}
