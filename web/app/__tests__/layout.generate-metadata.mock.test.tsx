import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateMetadata } from '../layout'

interface HeaderBag {
  get: (key: string) => string | null
}
type HeadersModule = typeof import('next/headers')
type MonoFontModule = typeof import('geist/font/mono')
type SansFontModule = typeof import('geist/font/sans')

// generateMetadata is a narrow, mostly-pure export off ../layout.tsx — it never invokes
// RootLayout, so it needs none of that component tree's rendering mocks (sidebar, auth provider,
// GTM, etc.). Split into its own file rather than sharing layout.mock.test.tsx's ~170-line mock
// preamble, which is already at the 300-line test-file cap. Lives in __tests__/ (rather than
// beside ../layout.tsx like layout.mock.test.tsx) because two test files now share the layout.tsx
// stem — see the repo-file-policy duplicate-stem placement rule.
const headersMock = vi.hoisted(() => vi.fn<() => Promise<HeaderBag>>())
const getTraceDataMock = vi.hoisted(() =>
  vi.fn<() => Record<string, string>>(() => ({ 'sentry-trace': 'trace-value' })),
)

vi.mock(import('next/headers'), () => ({ headers: headersMock }) as unknown as HeadersModule)
vi.mock(import('@sentry/nextjs'), () => ({ getTraceData: getTraceDataMock }))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createRootMetadata: vi.fn<() => Record<string, string>>(() => ({ title: 'Voucha' })),
}))
vi.mock(
  import('geist/font/mono'),
  () => ({ GeistMono: { variable: 'geist-mono' } }) as unknown as MonoFontModule,
)
vi.mock(
  import('geist/font/sans'),
  () => ({ GeistSans: { variable: 'geist-sans' } }) as unknown as SansFontModule,
)

describe('generateMetadata', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('includes Sentry trace meta by default', async () => {
    headersMock.mockResolvedValue({ get: () => null })

    const metadata = await generateMetadata()

    expect(metadata.other).toEqual({ 'sentry-trace': 'trace-value' })
  })

  it('omits Sentry trace meta on a cache-fill render so it never enters the shared edge cache', async () => {
    headersMock.mockResolvedValue({
      get: key => (key === 'x-voucha-request-kind' ? 'cache-fill' : null),
    })

    const metadata = await generateMetadata()

    expect(metadata.other).toEqual({})
    expect(getTraceDataMock).not.toHaveBeenCalled()
  })
})
