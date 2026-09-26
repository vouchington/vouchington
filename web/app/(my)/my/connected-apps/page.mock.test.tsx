import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ListResponse } from '@/types/api-responses'
import type { OAuthGrant } from '@/types/oauth-apps'
import grantsFixture from '../../../../../api-fixtures/v1/responses/native.my.oauth-grants.paginated.json'

const { mockGetMyOAuthGrants } = vi.hoisted(() => ({
  mockGetMyOAuthGrants: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server'), () => ({
  getMyOAuthGrants: mockGetMyOAuthGrants,
}))
vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: async () => (key: string) => key,
}))
vi.mock(import('@/components/my/settings-page-header'), () => ({
  SettingsPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))
vi.mock(import('@/components/my/connected-apps-manager'), () => ({
  ConnectedAppsManager: ({ initialData }: { initialData: ListResponse<OAuthGrant> }) => (
    <div data-testid='connected-apps-page-data'>
      {initialData.results.map(grant => grant.id).join(',')}
    </div>
  ),
}))

import ConnectedAppsPage from './page'

describe('ConnectedAppsPage', () => {
  it('passes the signed-in user grants to the manager', async () => {
    mockGetMyOAuthGrants.mockResolvedValue(grantsFixture as ListResponse<OAuthGrant>)

    render(await ConnectedAppsPage())

    expect(mockGetMyOAuthGrants).toHaveBeenCalledWith()
    expect(screen.getByRole('heading')).toHaveTextContent(
      'extracted.connectedApps.page.connectedApps_4d658e7e',
    )
    expect(screen.getByTestId('connected-apps-page-data')).toHaveTextContent(
      '00000000-0000-7000-8000-000000000711',
    )
  })
})
