import { ClientRequest } from '@vouchington/api-client'
import type { ExposureResponse } from '@/lib/api/client/moderation-exposure'
import '@/storybook/mocks/client-api-instance'

const exposureResponse: ExposureResponse = {
  exposure: { count: 3, threshold: 8, in_cooldown: false, cooldown_ends_at: null },
}

let previousGet: ClientRequest['get'] | null = null

export function setExposureStateFixture(): void {
  if (previousGet) return
  const delegateGet = ClientRequest.prototype.get
  previousGet = delegateGet
  ClientRequest.prototype.get = function storyExposureGet<T>(
    endpoint: string,
    options?: Parameters<ClientRequest['get']>[1],
  ): Promise<T> {
    if (endpoint === '/api/v1/moderation/exposure') {
      return Promise.resolve(exposureResponse as T)
    }
    return delegateGet.call(this, endpoint, options) as Promise<T>
  }
}

export function clearExposureStateFixture(): void {
  if (!previousGet) return
  ClientRequest.prototype.get = previousGet
  previousGet = null
}
