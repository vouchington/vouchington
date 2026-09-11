import { describe, expect, it, vi, beforeEach } from 'vitest'
import { clientApi } from '@/lib/api/client/instance'
import {
  fetchDynamicConfigNamespace,
  fetchDynamicConfigNamespaceHistory,
  fetchDynamicConfigNamespaces,
  updateDynamicConfigNamespace,
} from '../dynamic-config'

type ClientApi = typeof import('@/lib/api/client/instance').clientApi

vi.mock(
  import('@/lib/api/client/instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<ClientApi['get']>(),
        patch: vi.fn<ClientApi['patch']>(),
      },
    }) as unknown as typeof import('@/lib/api/client/instance'),
)

const mockedClientApi = vi.mocked(clientApi)

describe('dynamic config client helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches namespaces', async () => {
    mockedClientApi.get.mockResolvedValueOnce({ namespaces: [] })

    await expect(fetchDynamicConfigNamespaces()).resolves.toEqual({ namespaces: [] })

    expect(mockedClientApi.get).toHaveBeenCalledWith('/api/v1/dynamic-config/namespaces')
  })

  it('fetches one namespace with URL encoding', async () => {
    mockedClientApi.get.mockResolvedValueOnce({ namespace: { namespace: 'feature flags' } })

    await fetchDynamicConfigNamespace('feature flags')

    expect(mockedClientApi.get).toHaveBeenCalledWith(
      '/api/v1/dynamic-config/namespaces/feature%20flags',
    )
  })

  it('updates one namespace', async () => {
    mockedClientApi.patch.mockResolvedValueOnce({ changed: true, namespace: {} })

    await updateDynamicConfigNamespace('feature-flags', { memberships: true })

    expect(mockedClientApi.patch).toHaveBeenCalledWith(
      '/api/v1/dynamic-config/namespaces/feature-flags',
      { config: { memberships: true } },
    )
  })

  it('fetches namespace history', async () => {
    mockedClientApi.get.mockResolvedValueOnce({ history: [] })

    await fetchDynamicConfigNamespaceHistory('feature-flags')

    expect(mockedClientApi.get).toHaveBeenCalledWith(
      '/api/v1/dynamic-config/namespaces/feature-flags/history',
    )
  })
})
