import { getUserDataRequest, type DataRequest } from '@/lib/api/client/users'
import { ApiError } from '@/lib/api/error'

export interface StreamPayload {
  status: string
  download_url?: string | null
}

export async function loadDataRequest(userId: string): Promise<DataRequest | null> {
  return getUserDataRequest(userId).catch(error => {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  })
}
