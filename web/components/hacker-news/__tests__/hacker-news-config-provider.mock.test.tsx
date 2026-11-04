import '@/test-helpers/i18n/mock-json-messages'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from 'vouchington-tooling/next-navigation-mock'
import { HackerNewsConfigProvider } from '../hacker-news-config-provider'
import { HackerNewsFilterToggle } from '../hacker-news-filter-toggle'
import { HackerNewsReferenceLabel } from '../hacker-news-reference-label'
import { HackerNewsReferencesProvider } from '../hacker-news-references-context'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)
const mockGet = vi.hoisted(() => vi.fn<() => Promise<unknown>>())
vi.mock(
  import('@/lib/api/client/instance'),
  () => ({ clientApi: { get: mockGet } }) as unknown as typeof import('@/lib/api/client/instance'),
)
const nav = createNavMock()

describe('Hacker News runtime visibility', () => {
  it('hides preloaded references and the filter when a refresh disables visibility', async () => {
    nav.reset()
    let resolve!: (value: unknown) => void
    mockGet.mockReturnValue(
      new Promise(done => {
        resolve = done
      }),
    )
    render(
      <HackerNewsConfigProvider
        initialConfig={{ references_visible: true, post_time_range_cap: '1y' }}
      >
        <HackerNewsFilterToggle />
        <HackerNewsReferencesProvider references={{ item: { story_count: 1, comment_count: 0 } }}>
          <HackerNewsReferenceLabel entityId='item' />
        </HackerNewsReferencesProvider>
      </HackerNewsConfigProvider>,
    )
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
    expect(screen.getByText('Seen on Hacker News · 1')).toBeInTheDocument()
    await act(async () => {
      resolve({ references_visible: false, post_time_range_cap: '1m' })
    })
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByText('Seen on Hacker News · 1')).not.toBeInTheDocument()
    expect(nav.refresh).toHaveBeenCalledOnce()
  })
})
