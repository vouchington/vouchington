import { useState } from 'react'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { getTotpAuthenticatorsClient } from '@/lib/api/client'
import type { ListResponse } from '@/types/api-responses'
import type { TotpAuthenticator } from '@/types/user'

export function useTotpPagination(initialData: ListResponse<TotpAuthenticator>) {
  const pagination = usePaginatedList(
    initialData,
    '/api/v1/auth/totp',
    {},
    {
      loadPage: after => getTotpAuthenticatorsClient({ after }),
    },
  )
  const [createdAuthenticators, setCreatedAuthenticators] = useState<TotpAuthenticator[]>([])
  const [renamedById, setRenamedById] = useState<ReadonlyMap<string, string>>(() => new Map())
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(() => new Set())

  const authenticatorsById = new Map<string, TotpAuthenticator>()
  for (const authenticator of [
    ...createdAuthenticators,
    ...pagination.pages.flatMap(page => page.results),
  ]) {
    if (removedIds.has(authenticator.id) || authenticatorsById.has(authenticator.id)) continue
    const renamedTo = renamedById.get(authenticator.id)
    authenticatorsById.set(
      authenticator.id,
      renamedTo ? { ...authenticator, name: renamedTo } : authenticator,
    )
  }

  return {
    authenticators: [...authenticatorsById.values()],
    pagination,
    // Net change vs. the server-reported mfaStatus.totp_count snapshot, from
    // authenticators added or removed locally this session (see use-totp-manager.ts).
    netAuthenticatorCountDelta: createdAuthenticators.length - removedIds.size,
    addAuthenticator: (authenticator: TotpAuthenticator) =>
      setCreatedAuthenticators(prev => [authenticator, ...prev]),
    renameAuthenticatorLocally: (id: string, name: string) =>
      setRenamedById(prev => new Map(prev).set(id, name)),
    removeAuthenticatorLocally: (id: string) => setRemovedIds(prev => new Set(prev).add(id)),
  }
}
