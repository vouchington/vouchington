import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PUBLIC_LOCALIZATION_CONSUMERS } from '@vouchington/localization'

vi.mock<typeof import('node:fs')>(import('node:fs'), async importOriginal => importOriginal())
import { createLocalizationRoute } from './localization-route-helpers.mts'
import { createSampleLocalizationContext } from '@voucha/test-helpers/localization-fixtures'

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
  let context: ReturnType<typeof createSampleLocalizationContext>
  let localizationRoute: ReturnType<typeof createLocalizationRoute>
  beforeEach(() => {
    context = createSampleLocalizationContext()
    localizationRoute = createLocalizationRoute(context.resolver.localizationGetResult)
  })

  afterEach(() => {
    context.close()
  })

  it('publishes a required public-consumer enum in both API contracts', () => {
    const bundle = JSON.parse(
      readFileSync(
        new URL('../../../../api-fixtures/v1/request-contracts.json', import.meta.url),
        'utf8',
      ),
    ) as {
      operations: Record<
        string,
        { query: { required: string[]; properties: Record<string, unknown> } }
      >
    }
    expect(bundle.operations['GET:/api/v1/localization']?.query).toMatchObject({
      required: ['consumer'],
      properties: { consumer: { type: 'string', enum: [...PUBLIC_LOCALIZATION_CONSUMERS] } },
    })
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

  it.each([
    ['repeated consumer', { consumer: ['web', 'native'], locales: 'en' }],
    ['unknown consumer', { consumer: 'unknown', locales: 'en' }],
  ])('rejects a %s before rendering a localization payload', (_label, query) => {
    const ctx = createContext(query)

    expect(() => localizationRoute(ctx as never)).toThrow(/consumer/i)
    expect(ctx.throw).toHaveBeenCalledWith(400, expect.any(String))
    expect(ctx.json).not.toHaveBeenCalled()
  })

  it('accepts repeated locale and selector values through the query boundary', () => {
    const ctx = createContext({
      consumer: 'web',
      locales: ['en', 'es'],
      selectors: ['nav.*', 'email.welcome.preview'],
    })

    localizationRoute(ctx as never)
    expect(ctx.json).toHaveBeenCalled()
  })
})
