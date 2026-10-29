import '@/test-helpers/i18n/mock-json-messages'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule } from 'vouchington-tooling/next-navigation-mock'
import DomainsComparePage from './page'

const compare = vi.hoisted(() => vi.fn<VitestLooseMock>())
const redirect = vi.hoisted(() =>
  vi.fn<(path: string) => never>(path => {
    throw new Error(`permanentRedirect:${path}`)
  }),
)
vi.mock(
  import('next/navigation'),
  () => ({ ...navMockModule, permanentRedirect: redirect }) as typeof import('next/navigation'),
)
vi.mock(
  import('@/lib/api/server/hostnames'),
  () =>
    ({
      getHostnamesCompare: compare,
    }) as unknown as typeof import('@/lib/api/server/hostnames'),
)
vi.mock(
  import('@/lib/auth/get-current-user'),
  () =>
    ({
      getCurrentUser: async () => null,
    }) as unknown as typeof import('@/lib/auth/get-current-user'),
)
vi.mock(
  import('@/components/domains/domain-trust-badge'),
  () =>
    ({
      DomainTrustBadge: () => null,
    }) as unknown as typeof import('@/components/domains/domain-trust-badge'),
)
vi.mock(
  import('@/components/seo/anonymous-structured-data-script'),
  () =>
    ({
      AnonymousStructuredDataScript: () => null,
    }) as unknown as typeof import('@/components/seo/anonymous-structured-data-script'),
)

const hostname = {
  id: '019f0000-0000-7000-8000-000000000001',
  hostname: 'example.com',
  topic_id: null,
}
const secondHostname = {
  id: '019f0000-0000-7000-8000-000000000002',
  hostname: 'test.org',
  topic_id: null,
}
const compareData = {
  hostnames: { [hostname.id]: hostname, [secondHostname.id]: secondHostname },
  topics: {},
  hostname_elections: {},
}

describe('DomainsComparePage natural-key URL', () => {
  beforeEach(() => {
    compare.mockReset()
    compare.mockResolvedValue(compareData)
    redirect.mockClear()
  })

  it('redirects an ID in the hostname parameter to its canonical hostname', async () => {
    await expect(
      DomainsComparePage({
        searchParams: Promise.resolve({ hostnames: hostname.id.toUpperCase() }),
      }),
    ).rejects.toThrow('permanentRedirect:/domains/compare?hostnames=example.com')
    expect(compare).toHaveBeenCalledWith([hostname.id.toUpperCase()])
  })

  it('redirects a legacy ID list in requested order', async () => {
    await expect(
      DomainsComparePage({
        searchParams: Promise.resolve({ ids: `${secondHostname.id},${hostname.id}` }),
      }),
    ).rejects.toThrow('permanentRedirect:/domains/compare?hostnames=test.org%2Cexample.com')
  })

  it('prefers canonical hostname input when both query forms are present', async () => {
    await expect(
      DomainsComparePage({
        searchParams: Promise.resolve({ hostnames: hostname.hostname, ids: secondHostname.id }),
      }),
    ).rejects.toThrow('permanentRedirect:/domains/compare?hostnames=example.com')
    expect(compare).toHaveBeenCalledWith([hostname.hostname])
  })

  it('cleans an unknown legacy ID without rendering it', async () => {
    compare.mockResolvedValue({ hostnames: {}, topics: {}, hostname_elections: {} })
    await expect(
      DomainsComparePage({ searchParams: Promise.resolve({ ids: 'unknown-id' }) }),
    ).rejects.toThrow('permanentRedirect:/domains/compare')
  })

  it('keeps the empty state for an unknown canonical hostname', async () => {
    compare.mockResolvedValue({ hostnames: {}, topics: {}, hostname_elections: {} })
    render(
      await DomainsComparePage({ searchParams: Promise.resolve({ hostnames: 'missing.example' }) }),
    )
    expect(screen.getByRole('button', { name: 'Compare hostnames' })).toBeDisabled()
    expect(screen.queryByText(hostname.hostname)).not.toBeInTheDocument()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('keeps a matching canonical hostname', async () => {
    render(
      await DomainsComparePage({ searchParams: Promise.resolve({ hostnames: hostname.hostname }) }),
    )
    expect(screen.getByRole('button', { name: `${hostname.hostname} ×` })).toBeInTheDocument()
  })

  it('redirects a resolvable hostname with noncanonical casing', async () => {
    await expect(
      DomainsComparePage({ searchParams: Promise.resolve({ hostnames: 'EXAMPLE.COM' }) }),
    ).rejects.toThrow('permanentRedirect:/domains/compare?hostnames=example.com')
    expect(compare).toHaveBeenCalledWith(['EXAMPLE.COM'])
  })

  it('resets picker chips when comparison navigation changes and returns', async () => {
    const page = (hostnames: string) =>
      DomainsComparePage({ searchParams: Promise.resolve({ hostnames }) })
    const { rerender } = render(await page(hostname.hostname))
    rerender(await page(secondHostname.hostname))
    expect(screen.getByRole('button', { name: `${secondHostname.hostname} ×` })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: `${hostname.hostname} ×` })).not.toBeInTheDocument()
    rerender(await page(hostname.hostname))
    expect(screen.getByRole('button', { name: `${hostname.hostname} ×` })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: `${secondHostname.hostname} ×` }),
    ).not.toBeInTheDocument()
  })
})
