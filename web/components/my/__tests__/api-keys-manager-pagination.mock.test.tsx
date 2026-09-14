import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createTranslator, type MessageKey } from '@ts-shared/ui-messages'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListResponse } from '@/types/api-responses'
import type { ApiKey } from '@/types/api-keys'
import { ApiKeysManager } from '../api-keys-manager'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'

let translate!: (key: MessageKey, params?: Record<string, unknown>) => string

vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => translate,
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: {
        success: vi.fn<VitestLooseMock>(),
        error: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/api/client/api-keys'), () => ({
  createApiKey: vi.fn<VitestLooseMock>(),
  getApiKeys: vi.fn<VitestLooseMock>(),
  revokeApiKey: vi.fn<VitestLooseMock>(),
}))

import { getApiKeys, revokeApiKey } from '@/lib/api/client/api-keys'

const mockGet = vi.mocked(getApiKeys)
const mockRevoke = vi.mocked(revokeApiKey)

function makeApiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 'key-default',
    label: 'Default Reader',
    prefix: 'rss_live_default',
    type: 'rss',
    permissions: ['rss-feeds:read'],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    last_used_at: null,
    revoked_at: null,
    ...overrides,
  }
}

function makeFirstPage(results: ApiKey[]): ListResponse<ApiKey> {
  return {
    results,
    page_info: { has_next_page: true, end_cursor: 'page-2', start_cursor: null },
  }
}

describe('ApiKeysManager pagination revocation', () => {
  beforeAll(() => {
    translate = createTranslator('en', enMessages)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockRevoke.mockResolvedValue(undefined)
  })

  it('keeps a continuation key revoked when stale page data is recomposed', async () => {
    const firstPageKey = makeApiKey({ id: 'key-page-1', label: 'First Page Reader' })
    const continuationKey = makeApiKey({
      id: 'key-page-2',
      label: 'Continuation Reader',
      prefix: 'rss_live_page_2',
    })
    mockGet.mockResolvedValueOnce({
      results: [continuationKey],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })
    const { rerender } = render(<ApiKeysManager initialData={makeFirstPage([firstPageKey])} />)

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    const continuationRow = (await screen.findByText('Continuation Reader')).closest('li')!
    fireEvent.click(within(continuationRow).getByRole('button', { name: /Revoke/i }))
    await act(async () => {
      fireEvent.click(within(continuationRow).getByRole('button', { name: /Confirm/i }))
    })

    await waitFor(() => {
      expect(mockRevoke).toHaveBeenCalledWith('key-page-2')
      expect(screen.getByText('Continuation Reader').closest('li')).toHaveAttribute(
        'data-pw',
        'api-key-revoked-row',
      )
    })

    rerender(
      <ApiKeysManager
        initialData={makeFirstPage([firstPageKey, { ...continuationKey, revoked_at: null }])}
      />,
    )

    expect(screen.getByText('Continuation Reader').closest('li')).toHaveAttribute(
      'data-pw',
      'api-key-revoked-row',
    )
    expect(screen.getByText('First Page Reader').closest('li')).toHaveAttribute(
      'data-pw',
      'api-key-active-row',
    )
    expect(document.querySelectorAll('[data-pw="api-key-active-row"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-pw="api-key-revoked-row"]')).toHaveLength(1)
  })
})
