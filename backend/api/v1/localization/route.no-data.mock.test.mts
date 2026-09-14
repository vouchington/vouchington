import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock<typeof import('node:fs')>(import('node:fs'), async importOriginal => importOriginal())
import { localizationRoute } from './route.mts'
import { setLocalizationDatabaseForTests } from '@services/localization'
import { installSampleLocalizationDatabase } from '@services/localization/test-helpers'

function createContext(query: Record<string, unknown>, ifNoneMatch?: string) {
  const ctx = {
    query,
    req: { headers: { 'if-none-match': ifNoneMatch } },
    set: vi.fn<(name: string, value: string) => void>(),
    setStatus: vi.fn<(status: number) => void>(),
    json: vi.fn<(body: Record<string, unknown>) => void>(),
    throw: vi.fn<(status: number, message: string) => never>((status, message) => {
      const error = new Error(message) as Error & { status: number }
      error.status = status
      throw error
    }),
  }
  return ctx
}

describe('localization route handler', () => {
  beforeEach(() => {
    installSampleLocalizationDatabase()
  })

  afterEach(() => {
    setLocalizationDatabaseForTests(undefined)
  })

  it('writes JSON, 304, and 400 responses', () => {
    const ok = createContext({ consumer: 'web', locales: 'en', selectors: 'nav.*' })
    localizationRoute(ok as never)
    expect(ok.json).toHaveBeenCalled()
    const etag = ok.set.mock.calls.find(call => call[0] === 'ETag')?.[1]
    const cached = createContext({ consumer: 'web', locales: 'en', selectors: 'nav.*' }, etag)
    localizationRoute(cached as never)
    expect(cached.setStatus).toHaveBeenCalledWith(304)
    const missing = createContext({})
    expect(() => localizationRoute(missing as never)).toThrow(/consumer is required/)
    const boom = createContext({ consumer: 'web', locales: 'en', selectors: 'nav.*' })
    boom.throw = vi.fn<(status: number, message: string) => never>()
    boom.set = vi.fn<(name: string, value: string) => void>(() => {
      throw new Error('headers failed')
    })
    expect(() => localizationRoute(boom as never)).toThrow(/headers failed/)
  })
})
