import { useState } from 'react'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { getPasskeysClient } from '@/lib/api/client'
import type { ListResponse } from '@/types/api-responses'
import type { Passkey } from '@/types/user'

export function usePasskeyPagination(initialData: ListResponse<Passkey>) {
  const pagination = usePaginatedList(
    initialData,
    '/api/v1/auth/passkeys',
    {},
    {
      loadPage: after => getPasskeysClient({ after }),
    },
  )
  const [createdPasskeys, setCreatedPasskeys] = useState<Passkey[]>([])
  const [renamedById, setRenamedById] = useState<ReadonlyMap<string, string>>(() => new Map())
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(() => new Set())

  const passkeysById = new Map<string, Passkey>()
  for (const passkey of [...createdPasskeys, ...pagination.pages.flatMap(page => page.results)]) {
    if (removedIds.has(passkey.id) || passkeysById.has(passkey.id)) continue
    const renamedTo = renamedById.get(passkey.id)
    passkeysById.set(passkey.id, renamedTo ? { ...passkey, name: renamedTo } : passkey)
  }

  return {
    passkeys: [...passkeysById.values()],
    pagination,
    // Net change vs. the server-reported mfaStatus.passkeys_count snapshot, from
    // passkeys added or removed locally this session (see use-passkey-manager.ts).
    netPasskeyCountDelta: createdPasskeys.length - removedIds.size,
    addPasskey: (passkey: Passkey) => setCreatedPasskeys(prev => [passkey, ...prev]),
    renamePasskeyLocally: (id: string, name: string) =>
      setRenamedById(prev => new Map(prev).set(id, name)),
    removePasskeyLocally: (id: string) => setRemovedIds(prev => new Set(prev).add(id)),
  }
}
