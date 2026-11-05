import { usePaginatedList } from '@/hooks/use-paginated-list'
import { usePendingAiRefresh } from '@/hooks/use-pending-ai-refresh'
import { listCopyrightEmailIntakes } from '@/lib/api/client/copyright-email-intakes'
import type {
  CopyrightEmailIntakeQueueItem,
  CopyrightEmailIntakeQueuePage,
} from '@/types/copyright-notices'

export function useCopyrightEmailReviewQueue(data: CopyrightEmailIntakeQueuePage) {
  const pagination = usePaginatedList(
    data,
    '/api/v1/copyright-email-intakes/review-queue',
    {},
    { loadPage: after => listCopyrightEmailIntakes({ after }) },
  )
  const itemById = new Map<string, CopyrightEmailIntakeQueueItem>()
  for (const page of pagination.pages) {
    for (const item of page.copyright_email_intakes) itemById.set(item.id, item)
  }
  const items = [...itemById.values()]
  const pendingItems = items.filter(
    item =>
      item.waiting_reason === 'awaiting_review' &&
      item.parse_status === 'succeeded' &&
      item.recommendation_id === null,
  )
  const refreshTimedOut = usePendingAiRefresh(
    pendingItems.length > 0,
    () => pagination.refreshLoadedPages?.(() => listCopyrightEmailIntakes()),
    pendingItems.map(item => item.id).join('|'),
  )
  return { ...pagination, items, refreshTimedOut }
}

export type CopyrightEmailReviewQueue = ReturnType<typeof useCopyrightEmailReviewQueue>
