import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createTranslator, type MessageKey } from '@ts-shared/ui-messages'
import ChannelsPage from '../channels/import-export/page'
import NewsSourcesPage from '../news-sources/import-export/page'
import PodcastsPage from '../podcasts/import-export/page'
import SourcesPage from '../sources/import-export/page'
import TopicsPage from '../topics/import-export/page'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))

vi.mock(import('@/components/my/settings-page-header'), () => ({
  SettingsPageHeader: ({ title }: { title: string }) => (
    <div data-testid='settings-page-header'>{title}</div>
  ),
}))

vi.mock(import('@/components/my/import-export/import-export-manager'), () => ({
  ImportExportManager: ({ feedType }: { feedType: string }) => (
    <div data-testid='import-export-manager'>{feedType}</div>
  ),
}))

// Every import-export page is an async Server Component that calls getTranslations(), which
// resolves the request's UI locale via getResolvedUiLocale() (headers()/getCurrentUser() — no
// request context in this test). Mocking the boundary with a real-catalog translator keeps the
// render synchronous while still resolving keys against the real en catalog, so drift in
// ts-shared/ui-messages/messages/en.ts still breaks this test.
let translate!: (key: MessageKey, params?: Record<string, unknown>) => string

vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: () => Promise.resolve(translate),
}))

describe('import-export pages', () => {
  beforeAll(async () => {
    translate = createTranslator('en', enMessages)
  })

  describe('Channels import-export page', () => {
    it('renders with video feedType', async () => {
      render(await ChannelsPage())
      expect(screen.getByTestId('import-export-manager')).toBeDefined()
      expect(screen.getByTestId('import-export-manager').textContent).toBe('video')
    })
  })

  describe('News Sources import-export page', () => {
    it('renders with article feedType', async () => {
      render(await NewsSourcesPage())
      expect(screen.getByTestId('import-export-manager')).toBeDefined()
      expect(screen.getByTestId('import-export-manager').textContent).toBe('article')
    })
  })

  describe('Podcasts import-export page', () => {
    it('renders with podcast feedType', async () => {
      render(await PodcastsPage())
      expect(screen.getByTestId('import-export-manager')).toBeDefined()
      expect(screen.getByTestId('import-export-manager').textContent).toBe('podcast')
    })
  })

  describe('Topics import-export page', () => {
    it('renders with topics feedType', async () => {
      render(await TopicsPage())
      expect(screen.getByTestId('import-export-manager')).toBeDefined()
      expect(screen.getByTestId('import-export-manager').textContent).toBe('topics')
    })
  })

  describe('Sources import-export page', () => {
    it('renders with all feedType', async () => {
      render(await SourcesPage())
      expect(screen.getByTestId('import-export-manager')).toBeDefined()
      expect(screen.getByTestId('import-export-manager').textContent).toBe('all')
    })
  })
})
