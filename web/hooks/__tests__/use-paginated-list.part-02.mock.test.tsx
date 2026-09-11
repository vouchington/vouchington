import { act, fireEvent, render, screen } from '@testing-library/react'
import { startTransition, Suspense, use } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPaginatedPage } from '@/lib/api/client'
import { usePaginatedList } from '../use-paginated-list'

vi.mock(import('@/lib/api/client'), () => ({
  getPaginatedPage: vi.fn<VitestLooseMock>(),
}))

interface TestPage {
  items: string[]
  page_info: {
    has_next_page: boolean
    end_cursor: string | null
  }
}

function makePage(items: string[], endCursor: string | null): TestPage {
  return {
    items,
    page_info: {
      has_next_page: endCursor !== null,
      end_cursor: endCursor,
    },
  }
}

describe('usePaginatedList concurrent rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps a committed continuation request current when a different query render is abandoned', async () => {
    let resolvePage!: (page: TestPage) => void
    const suspendedRender = new Promise<never>(() => {})
    vi.mocked(getPaginatedPage).mockImplementationOnce(
      () => new Promise<TestPage>(resolve => (resolvePage = resolve)),
    )
    const firstInitial = makePage(['first-1'], 'first-cursor')
    const secondInitial = makePage(['second-1'], 'second-cursor')

    function PaginationHarness({ filter }: { filter: string }) {
      const pagination = usePaginatedList(
        filter === 'first' ? firstInitial : secondInitial,
        '/api/v1/items',
        { filter },
      )
      if (filter === 'second') use(suspendedRender)
      return (
        <button
          onClick={() => void pagination.loadMore()}
          type='button'
        >
          {pagination.loadingMore
            ? 'Loading'
            : pagination.pages.flatMap(page => page.items).join(',')}
        </button>
      )
    }

    const { rerender } = render(
      <Suspense fallback={<p>Switching query</p>}>
        <PaginationHarness filter='first' />
      </Suspense>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'first-1' }))
    expect(screen.getByRole('button', { name: 'Loading' })).toBeInTheDocument()

    await act(async () => {
      startTransition(() => {
        rerender(
          <Suspense fallback={<p>Switching query</p>}>
            <PaginationHarness filter='second' />
          </Suspense>,
        )
      })
    })
    expect(screen.getByRole('button', { name: 'Loading' })).toBeInTheDocument()

    rerender(
      <Suspense fallback={<p>Switching query</p>}>
        <PaginationHarness filter='first' />
      </Suspense>,
    )

    await act(async () => {
      resolvePage(makePage(['first-2'], null))
    })

    expect(screen.getByRole('button', { name: 'first-1,first-2' })).toBeInTheDocument()
  })
})
