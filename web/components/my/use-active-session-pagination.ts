import { useMemo, useState } from 'react'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { getAuthSessions } from '@/lib/api/client'
import type { ListResponse } from '@/types/api-responses'
import type { AuthSession } from '@/types/my'

const EMPTY_SESSIONS: AuthSession[] = []

export function useActiveSessionPagination(
  initialData?: ListResponse<AuthSession>,
  initialSessions?: AuthSession[],
) {
  const legacySessions = initialSessions ?? EMPTY_SESSIONS
  const firstPage = useMemo(
    () =>
      initialData ?? {
        results: legacySessions,
        page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      },
    [initialData, legacySessions],
  )
  const pagination = usePaginatedList(
    firstPage,
    '/api/v1/auth/sessions',
    {},
    {
      loadPage: after => getAuthSessions({ after }),
    },
  )
  const [revokedIds, setRevokedIds] = useState<ReadonlySet<string>>(() => new Set())
  const sessions: AuthSession[] = []
  for (const page of pagination.pages) {
    for (const session of page.results) {
      if (!revokedIds.has(session.id)) sessions.push(session)
    }
  }
  return {
    pagination,
    sessions,
    removeSession: (sessionId: string) =>
      setRevokedIds(previous => new Set(previous).add(sessionId)),
  }
}
