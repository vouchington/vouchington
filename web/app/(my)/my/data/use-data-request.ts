'use client'
import { useState, useEffect } from 'react'
import {
  createUserDataRequest,
  isDataRequestResponse,
  type CreateOrConflictDataRequestResponse,
  type DataRequest,
} from '@/lib/api/client/users'
import { ApiError } from '@/lib/api/error'
import onError, { onSuccess } from '@/lib/on-error'
import { loadDataRequest } from './data-request-utils'
import { useDataRequestStream } from './use-data-request-stream'

export function useDataRequest(userId: string) {
  const [request, setRequest] = useState<DataRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function applyRequest(data: DataRequest | null) {
    if (!data) {
      setRequest(null)
      setError(null)
      return
    }
    setRequest(data)
    setError(data.status === 'failed' ? 'Your data export failed. Please try again.' : null)
  }

  useEffect(() => {
    loadDataRequest(userId)
      .then(applyRequest)
      .catch(() => setError('Failed to load export status. Please refresh.'))
      .finally(() => setLoading(false))
  }, [userId])

  useDataRequestStream({ userId, request, applyRequest, setError })

  const handleRequest = async () => {
    setRequesting(true)
    setError(null)
    try {
      const data = await createUserDataRequest(userId)
      if (isDataRequestResponse(data)) {
        onSuccess('Data export requested')
        setRequest({
          id: data.id,
          status: data.status,
          created_at: data.created_at,
          expires_at: data.expires_at ?? null,
          download_url: null,
        })
        return
      }
      setError(
        onError(new Error(data.error ?? 'Failed to request export'), {
          fallback: data.error ?? 'Failed to request export',
          tags: { form: 'my-data-export' },
          skipSentry: true,
        }),
      )
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const data = error.data as CreateOrConflictDataRequestResponse
        if (isDataRequestResponse(data)) {
          onSuccess('Data export request already in progress')
          setRequest({
            id: data.id,
            status: data.status,
            created_at: data.created_at,
            expires_at: data.expires_at ?? null,
            download_url: null,
          })
          return
        }
        try {
          applyRequest(await loadDataRequest(userId))
          onSuccess('Data export request already in progress')
          return
        } catch {
          setError(data.error ?? 'A data export is already in progress')
          return
        }
      }
      setError(
        onError(error, {
          fallback: 'An unexpected error occurred',
          tags: { form: 'my-data-export' },
        }),
      )
    } finally {
      setRequesting(false)
    }
  }

  return { request, loading, requesting, error, handleRequest }
}
