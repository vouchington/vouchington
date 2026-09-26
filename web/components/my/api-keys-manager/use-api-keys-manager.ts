/* oxlint-disable react-you-might-not-need-an-effect/no-event-handler -- legacy client-only callers load their initial page on mount */
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { createApiKey, getApiKeys, revokeApiKey } from '@/lib/api/client/api-keys'
import { ApiError } from '@/lib/api/error'
import type { ApiKey } from '@/types/api-keys'
import { useOptionalAuth } from '@/lib/auth/context'
import type { ScopeCatalogEntry } from '@/types/scopes'
import { useApiKeyScopeSelection } from './use-api-key-scope-selection'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ListResponse } from '@/types/api-responses'
import { usePaginatedList } from '@/hooks/use-paginated-list'

const EMPTY_PAGE: ListResponse<ApiKey> = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

export function useApiKeysManager(
  scopeCatalog: readonly ScopeCatalogEntry[],
  initialData?: ListResponse<ApiKey>,
) {
  const t = useTranslations()
  const auth = useOptionalAuth()
  const isAdmin = auth?.currentUser?.roles?.includes('administrator') ?? false
  const [clientFirstPage, setClientFirstPage] = useState(EMPTY_PAGE)
  const firstPage = initialData ?? clientFirstPage
  const pagination = usePaginatedList(
    firstPage,
    '/api/v1/my/api-keys',
    {},
    {
      loadPage: after => getApiKeys({ after }),
    },
  )
  const [createdKeys, setCreatedKeys] = useState<ApiKey[]>([])
  const [locallyRevokedAtById, setLocallyRevokedAtById] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  )
  const keysById = new Map<string, ApiKey>()
  for (const key of [...createdKeys, ...pagination.pages.flatMap(page => page.results)]) {
    if (keysById.has(key.id)) continue
    const locallyRevokedAt = locallyRevokedAtById.get(key.id)
    keysById.set(key.id, locallyRevokedAt ? { ...key, revoked_at: locallyRevokedAt } : key)
  }
  const keys = [...keysById.values()]
  const [loading, setLoading] = useState(!initialData)
  const [loadError, setLoadError] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [creating, setCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const { selection, reset: resetSelection } = useApiKeyScopeSelection(scopeCatalog)
  const [submitting, setSubmitting] = useState(false)
  const [newRawKey, setNewRawKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmingRevokeId, setConfirmingRevokeId] = useState<string | null>(null)
  const [revokingIds, setRevokingIds] = useState(new Set<string>())

  function loadApiKeys() {
    getApiKeys()
      .then(data => setClientFirstPage(data))
      .catch(() => {
        toast.error(t('extracted.my.apiKeysManager.failedToLoadApiKeys_78bef06b'))
        setLoadError(true)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!initialData) loadApiKeys()
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; loadApiKeys reads latest state/t via closure
  }, [])

  async function handleCreate() {
    if (!newLabel.trim()) {
      toast.error(t('extracted.my.apiKeysManager.pleaseEnterALabelForThe_629f978b'))
      return
    }
    setSubmitting(true)
    try {
      const result = await createApiKey(newLabel.trim(), selection.keyType, [
        ...selection.permissions,
      ])
      setCreatedKeys(prev => [result.api_key, ...prev.filter(key => key.id !== result.api_key.id)])
      setNewRawKey(result.raw_key)
      setCreating(false)
      setNewLabel('')
      resetSelection()
    } catch (error) {
      /* c8 ignore next -- error path requires injecting an API key creation failure */
      toast.error(
        error instanceof ApiError
          ? error.message
          : t('extracted.my.apiKeysManager.failedToCreateApiKey_f38e2ce7'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRevoke(id: string) {
    setRevokingIds(prev => new Set(prev).add(id))
    try {
      await revokeApiKey(id)
      const revokedAt = new Date().toISOString()
      setLocallyRevokedAtById(prev => new Map(prev).set(id, revokedAt))
      setConfirmingRevokeId(null)
      toast.success(t('extracted.my.apiKeysManager.apiKeyRevoked_be38cb67'))
    } catch (error) {
      /* c8 ignore next -- error path requires injecting an API key revoke failure */
      toast.error(
        error instanceof ApiError
          ? error.message
          : t('extracted.my.apiKeysManager.failedToRevokeApiKey_799ea7e5'),
      )
    } finally {
      setRevokingIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('extracted.my.apiKeysManager.failedToCopyToClipboard_978a1dc5'))
    }
  }

  return {
    isAdmin,
    keys,
    loading,
    loadError,
    creating,
    setCreating,
    newLabel,
    setNewLabel,
    selection,
    resetSelection,
    submitting,
    newRawKey,
    setNewRawKey,
    copied,
    confirmingRevokeId,
    setConfirmingRevokeId,
    revokingIds,
    handleCreate,
    handleRevoke,
    handleCopy,
    pagination,
  }
}
