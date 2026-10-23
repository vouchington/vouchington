import { vi } from 'vitest'
import { clientApi } from '../../../../lib/api/client/instance'

/** Spy at the owned request boundary while page tests exercise the real PSQL endpoint wrapper. */
export function spyOnPsqlRequestClient() {
  return {
    get: vi.spyOn(clientApi, 'get'),
    post: vi.spyOn(clientApi, 'post'),
  }
}
