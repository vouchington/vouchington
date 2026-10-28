import '@/test-helpers/i18n/mock-json-messages'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DomainsComparePage from './page'

const compare = vi.hoisted(() => vi.fn<VitestLooseMock>())
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
  import('@/components/domains/domain-compare-picker'),
  () =>
    ({
      DomainComparePicker: ({ initialHostnames }: { initialHostnames: string[] }) => (
        <div data-testid='selected-hostnames'>{initialHostnames.join(',')}</div>
      ),
    }) as unknown as typeof import('@/components/domains/domain-compare-picker'),
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
const compareData = { hostnames: { [hostname.id]: hostname }, topics: {}, hostname_elections: {} }

describe('DomainsComparePage natural-key URL', () => {
  beforeEach(() => compare.mockResolvedValue(compareData))

  it('does not display or compare a record resolved through an ID query', async () => {
    render(await DomainsComparePage({ searchParams: Promise.resolve({ hostnames: hostname.id }) }))
    expect(compare).toHaveBeenCalledWith([hostname.id])
    expect(screen.getByTestId('selected-hostnames')).toBeEmptyDOMElement()
    expect(screen.queryByText(hostname.hostname)).not.toBeInTheDocument()
    expect(screen.getByTestId('selected-hostnames')).not.toHaveTextContent(hostname.id)
  })

  it('keeps a matching canonical hostname', async () => {
    render(
      await DomainsComparePage({ searchParams: Promise.resolve({ hostnames: hostname.hostname }) }),
    )
    expect(screen.getByTestId('selected-hostnames')).toHaveTextContent(hostname.hostname)
  })
})
