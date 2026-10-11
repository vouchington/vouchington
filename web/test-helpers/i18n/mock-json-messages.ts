import { vi } from 'vitest'
import { catalogTreeForLocale } from '@ts-shared/ui-messages/load-catalog-json'

// Server page tests keep the real locale catalogs while isolating the Vitest-only
// dynamic loader. The loader itself has dedicated tests.
vi.mock(import('@/lib/i18n/load-json-messages'), () => ({
  loadJsonMessages: vi.fn<typeof import('@/lib/i18n/load-json-messages').loadJsonMessages>(
    async locale => catalogTreeForLocale(locale),
  ),
}))
