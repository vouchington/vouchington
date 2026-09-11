import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface HeaderBag {
  get: (key: string) => string | null
}

const { mockGetCurrentUser, mockHeaders } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockHeaders: vi.fn<() => Promise<HeaderBag>>(),
}))

vi.mock(
  import('next/headers'),
  () =>
    ({
      headers: mockHeaders,
    }) as unknown as typeof import('next/headers'),
)

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))

vi.mock(import('@/components/my/import-export/import-export-manager'), () => ({
  ImportExportManager: ({ feedType }: { feedType: string }) => (
    <div data-testid='import-export-manager'>{feedType}</div>
  ),
}))

import SourcesImportExportPage from './page'

describe('SourcesImportExportPage', () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(null)
    mockHeaders.mockResolvedValue({ get: () => null })
  })

  it('renders ImportExportManager with feedType=all', async () => {
    render(await SourcesImportExportPage())
    expect(screen.getByTestId('import-export-manager').textContent).toBe('all')
  })
})
