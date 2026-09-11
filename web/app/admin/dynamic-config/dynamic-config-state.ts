'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import {
  fetchDynamicConfigNamespace,
  fetchDynamicConfigNamespaceHistory,
  fetchDynamicConfigNamespaces,
  updateDynamicConfigNamespace,
  type DynamicConfigFieldValue,
  type DynamicConfigHistoryEntry,
  type DynamicConfigNamespace,
  type DynamicConfigNamespaceSummary,
} from '@/lib/api/client/dynamic-config'

export function useDynamicConfigState() {
  const [namespaces, setNamespaces] = useState<DynamicConfigNamespaceSummary[]>([])
  const [activeNamespace, setActiveNamespace] = useState<string | null>(null)
  const [details, setDetails] = useState<DynamicConfigNamespace | null>(null)
  const [history, setHistory] = useState<DynamicConfigHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [savingFields, setSavingFields] = useState<Record<string, boolean>>({})
  const activeNamespaceRef = useRef<string | null>(null)
  const namespaceRequestIdRef = useRef(0)
  const fetchingRef = useRef(false)
  const savingRef = useRef(false)

  const loadNamespace = useCallback(async (namespace: string) => {
    const requestId = ++namespaceRequestIdRef.current
    // Intent (which namespace is selected) is written synchronously so the latest caller always
    // wins, even if an older call's fetch resolves later. Only data resolution below is guarded
    // by requestId — guarding these two writes too would let a stale poll revert the selection.
    activeNamespaceRef.current = namespace
    setActiveNamespace(namespace)
    const [detailsData, historyData] = await Promise.all([
      fetchDynamicConfigNamespace(namespace),
      fetchDynamicConfigNamespaceHistory(namespace),
    ])
    if (namespaceRequestIdRef.current === requestId) {
      setDetails(detailsData.namespace)
      setHistory(historyData.history)
    }
  }, [])

  const loadData = useCallback(async () => {
    if (fetchingRef.current || savingRef.current) return
    fetchingRef.current = true
    setLoading(true)
    try {
      const data = await fetchDynamicConfigNamespaces()
      setNamespaces(data.namespaces)
      const currentNamespace = activeNamespaceRef.current
      const nextNamespace =
        currentNamespace && data.namespaces.some(item => item.namespace === currentNamespace)
          ? currentNamespace
          : data.namespaces[0]?.namespace
      if (nextNamespace) await loadNamespace(nextNamespace)
    } catch (error) {
      onError(error, {
        fallback: 'Failed to load dynamic config',
        tags: { form: 'admin-dynamic-config' },
      })
    } finally {
      fetchingRef.current = false
      setLoading(false)
    }
  }, [loadNamespace])

  useEffect(() => {
    queueMicrotask(loadData)
    const interval = setInterval(() => {
      void loadData()
    }, 10_000)
    return () => clearInterval(interval)
  }, [loadData])

  const selectNamespace = async (namespace: string) => {
    if (namespace === activeNamespaceRef.current) return
    setLoading(true)
    try {
      await loadNamespace(namespace)
    } catch (error) {
      onError(error, {
        fallback: 'Failed to load dynamic config namespace',
        tags: { form: 'admin-dynamic-config' },
      })
    } finally {
      setLoading(false)
    }
  }

  const updateField = async (field: string, value: DynamicConfigFieldValue) => {
    const namespace = activeNamespaceRef.current
    if (!namespace) return
    savingRef.current = true
    namespaceRequestIdRef.current++
    setSavingFields(prev => ({ ...prev, [field]: true }))
    try {
      const data = await updateDynamicConfigNamespace(namespace, { [field]: value })
      const historyData = await fetchDynamicConfigNamespaceHistory(namespace)
      if (activeNamespaceRef.current === namespace) {
        setDetails(data.namespace)
        setHistory(historyData.history)
      }
      onSuccess(data.changed ? 'Dynamic config updated' : 'No change to save')
    } catch (error) {
      onError(error, {
        fallback: 'Failed to update dynamic config',
        tags: { form: 'admin-dynamic-config' },
      })
      throw error
    } finally {
      savingRef.current = false
      setSavingFields(prev => ({ ...prev, [field]: false }))
    }
  }

  return {
    activeNamespace,
    details,
    history,
    loadData,
    loading,
    namespaces,
    savingFields,
    selectNamespace,
    updateField,
  }
}
