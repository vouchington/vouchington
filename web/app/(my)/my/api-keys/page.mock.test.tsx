import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ListResponse } from '@/types/api-responses'
import type { ApiKey } from '@/types/api-keys'
import type { OAuthApp } from '@/types/oauth-apps'
import type { ScopeCatalogEntry, ScopeCatalogResponse } from '@/types/scopes'
import appsFixture from '../../../../../api-fixtures/v1/responses/web.my.oauth-apps.paginated.json'
import scopeCatalogFixture from '../../../../../api-fixtures/v1/responses/shared.scopes.catalog.json'

const { mockGetMyApiKeys, mockGetMyOAuthApps, mockGetScopeCatalog } = vi.hoisted(() => ({
  mockGetMyApiKeys: vi.fn<VitestLooseMock>(),
  mockGetMyOAuthApps: vi.fn<VitestLooseMock>(),
  mockGetScopeCatalog: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getMyApiKeys: mockGetMyApiKeys,
  getMyOAuthApps: mockGetMyOAuthApps,
  getScopeCatalog: mockGetScopeCatalog,
}))
vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: async () => (key: string) => key,
}))
vi.mock(import('@/components/my/settings-page-header'), () => ({
  SettingsPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))
vi.mock(import('@/components/my/api-keys-manager'), () => ({
  ApiKeysManager: ({
    initialData,
    scopeCatalog,
  }: {
    initialData?: ListResponse<ApiKey>
    scopeCatalog: readonly ScopeCatalogEntry[]
  }) => (
    <div data-testid='api-keys-page-data'>
      {`${initialData?.results.length}|${scopeCatalog.length}`}
    </div>
  ),
}))
vi.mock(import('@/components/my/oauth-apps-manager'), () => ({
  OAuthAppsManager: ({
    initialData,
    scopeCatalog,
  }: {
    initialData: ListResponse<OAuthApp>
    scopeCatalog: readonly ScopeCatalogEntry[]
  }) => (
    <div data-testid='oauth-apps-page-data'>
      {`${initialData.results[0]?.client_name}|${scopeCatalog.length}`}
    </div>
  ),
}))

import ApiKeysPage from './page'

describe('ApiKeysPage', () => {
  it('passes API keys, OAuth apps, and the scope catalogue to the managers', async () => {
    const catalog = scopeCatalogFixture as ScopeCatalogResponse
    mockGetMyApiKeys.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })
    mockGetMyOAuthApps.mockResolvedValue(appsFixture as ListResponse<OAuthApp>)
    mockGetScopeCatalog.mockResolvedValue(catalog)

    render(await ApiKeysPage())

    expect(screen.getByRole('heading')).toHaveTextContent('extracted.apiKeys.page.apiKeys_c08f17eb')
    expect(screen.getByTestId('api-keys-page-data')).toHaveTextContent(`0|${catalog.scopes.length}`)
    expect(screen.getByTestId('oauth-apps-page-data')).toHaveTextContent(
      `Fixture Agent|${catalog.scopes.length}`,
    )
  })
})
