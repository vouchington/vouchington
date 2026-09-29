import { afterEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from './media-delivery-edge.mts'

describe('installTestMediaDeliveryEdge stub lifetime', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('enables publication while the edge double is installed', () => {
    installTestMediaDeliveryEdge()
    expect(process.env.MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED).toBe('true')
  })

  it('does not leave publication enabled for the next isolate:false test', () => {
    expect(process.env.MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED).toBeUndefined()
  })
})
