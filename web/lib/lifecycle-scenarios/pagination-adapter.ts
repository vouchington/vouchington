import {
  appendPaginatedPage,
  PaginatedRequestLifecycle,
  type PaginatedData,
} from '@/hooks/use-paginated-list-utils'
import {
  lifecycleNotApplicable,
  nullableStringValue,
  stringArrayValue,
  stringValue,
  type LifecycleAdapter,
} from './adapters'

interface LifecyclePage extends PaginatedData {
  results: Array<{ id: string }>
}

export const webForwardPagination: LifecycleAdapter = input => {
  const action = stringValue(input.action, 'type')
  const initial: LifecyclePage = {
    results: stringArrayValue(input.preconditions, 'itemIds').map(id => ({ id })),
    page_info: {
      has_next_page: nullableStringValue(input.preconditions, 'nextCursor') !== null,
      end_cursor: nullableStringValue(input.preconditions, 'nextCursor'),
    },
  }
  if (action === 'load-more-twice') {
    const requestLifecycle = new PaginatedRequestLifecycle()
    const firstRequest = requestLifecycle.start(requestLifecycle.queryToken)
    const secondRequest = requestLifecycle.start(requestLifecycle.queryToken)
    return {
      visibleState: {
        requestsStarted: Number(firstRequest !== null) + Number(secondRequest !== null),
        loading: firstRequest !== null,
      },
      availableActions: [],
      reconciliation: { strategy: 'single-flight' },
      cancellation: lifecycleNotApplicable,
    }
  }
  if (action === 'remove') {
    const itemId = stringValue(input.action, 'itemId')
    const results = initial.results.filter(item => item.id !== itemId)
    return {
      visibleState: {
        itemIds: results.map(item => item.id),
        nextCursor: initial.page_info.end_cursor,
      },
      availableActions: initial.page_info.end_cursor ? ['load-more'] : [],
      reconciliation: { strategy: 'preserve-continuation' },
      cancellation: lifecycleNotApplicable,
    }
  }
  if (action === 'reset-during-load') {
    const requestLifecycle = new PaginatedRequestLifecycle()
    const staleRequest = requestLifecycle.start(requestLifecycle.queryToken)
    const resetQueryToken = requestLifecycle.reset()
    const resetPage: LifecyclePage = {
      results: stringArrayValue(input.serverOutcome, 'resetItemIds').map(id => ({ id })),
      page_info: {
        has_next_page: nullableStringValue(input.serverOutcome, 'nextCursor') !== null,
        end_cursor: nullableStringValue(input.serverOutcome, 'nextCursor'),
      },
    }
    let pages = [resetPage]
    let error: string | null = null
    if (staleRequest && requestLifecycle.isCurrent(staleRequest)) {
      const staleItems = stringArrayValue(input.serverOutcome, 'staleItemIds')
      if (staleItems.length > 0) {
        pages = appendPaginatedPage(pages, {
          results: staleItems.map(id => ({ id })),
          page_info: { has_next_page: false, end_cursor: null },
        })
      }
      error = stringValue(input.serverOutcome, 'staleError') ?? null
    }
    const nextRequest = requestLifecycle.start(resetQueryToken)
    if (nextRequest) requestLifecycle.finish(nextRequest)
    return {
      visibleState: {
        itemIds: pages.flatMap(page => page.results.map(item => item.id)),
        nextCursor: pages.at(-1)!.page_info.end_cursor,
        error,
      },
      availableActions: nextRequest && resetPage.page_info.end_cursor ? ['load-more'] : [],
      reconciliation: { strategy: 'discard-stale-generation' },
      cancellation: lifecycleNotApplicable,
    }
  }
  if (input.serverOutcome.error !== undefined) {
    return {
      visibleState: {
        itemIds: initial.results.map(item => item.id),
        nextCursor: initial.page_info.end_cursor,
        error: 'network',
      },
      availableActions: initial.page_info.end_cursor ? ['retry'] : [],
      reconciliation: { strategy: 'preserve-and-retry' },
      cancellation: lifecycleNotApplicable,
    }
  }
  const next = stringArrayValue(input.serverOutcome, 'itemIds')
  const nextCursor = nullableStringValue(input.serverOutcome, 'nextCursor')
  const pages = appendPaginatedPage([initial], {
    results: next.map(id => ({ id })),
    page_info: { has_next_page: nextCursor !== null, end_cursor: nextCursor },
  })
  return {
    visibleState: { itemIds: pages.flatMap(page => page.results.map(item => item.id)), nextCursor },
    availableActions: nextCursor ? ['load-more'] : [],
    reconciliation: { strategy: 'deduplicate-by-id' },
    cancellation: lifecycleNotApplicable,
  }
}
