import type { DataRequest } from '@/lib/api/client/users'

export function shouldKeepStreamReconnecting(request: DataRequest | null): boolean {
  return !request || request.status === 'pending' || request.status === 'processing'
}
