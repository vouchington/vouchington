import {
  getUserDataRequest,
  type DataRequest,
  type DataRequestStatus,
} from '@/lib/api/client/users'
import { ApiError } from '@vouchington/api-client'

export interface StreamPayload {
  status: DataRequestStatus
  download_url?: string | null
}

export function isStreamPayload(value: unknown): value is StreamPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    isDataRequestStatus(value.status) &&
    (!('download_url' in value) ||
      value.download_url === null ||
      typeof value.download_url === 'string')
  )
}

export function parseStreamPayload(raw: unknown): StreamPayload | null {
  if (typeof raw !== 'string') return null
  try {
    const value: unknown = JSON.parse(raw)
    return isStreamPayload(value) ? value : null
  } catch {
    return null
  }
}

function isDataRequestStatus(value: unknown): value is DataRequestStatus {
  return (
    value === 'pending' ||
    value === 'processing' ||
    value === 'ready' ||
    value === 'failed' ||
    value === 'expired'
  )
}

export async function loadDataRequest(userId: string): Promise<DataRequest | null> {
  return getUserDataRequest(userId).catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  })
}
