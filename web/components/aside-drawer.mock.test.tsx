import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { AsideDrawer } from './aside-drawer'
import { AsideProvider } from '@/lib/aside-provider'
import { useSetMobileSheetOpen } from '@/lib/aside-context'

vi.mock(import('@/components/page-aside'), () => ({
  PageAside: () => <div data-testid='page-aside-drawer'>Drawer aside content</div>,
}))

/** Mock matchMedia as mobile (<lg) so toggleAside opens the Sheet */
function mockMatchMediaMobile() {
  vi.stubGlobal('matchMedia', (_query: string) => ({
    matches: false,
    media: _query,
    onchange: null,
    addListener: vi.fn<VitestLooseMock>(),
    removeListener: vi.fn<VitestLooseMock>(),
    addEventListener: vi.fn<VitestLooseMock>(),
    removeEventListener: vi.fn<VitestLooseMock>(),
    dispatchEvent: vi.fn<VitestLooseMock>(),
  }))
}

function Wrapper({ children }: { children: ReactNode }) {
  return <AsideProvider>{children}</AsideProvider>
}

describe('AsideDrawer', () => {
  beforeEach(() => {
    mockMatchMediaMobile()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders toggle button for non-infinite pages with content (showFooter=false)', () => {
    render(
      <Wrapper>
        <AsideDrawer showFooter={false}>
          <div>Content</div>
        </AsideDrawer>
      </Wrapper>,
    )

    // Toggle shows whenever content exists (not just on infinite-scroll pages)
    const button = screen.getByRole('button', { name: 'Toggle page sidebar' })
    expect(button).toBeDefined()
  })

  it('returns null when no children and no showFooter', () => {
    const { container } = render(
      <Wrapper>
        <AsideDrawer />
      </Wrapper>,
    )

    expect(container.firstChild).toBeNull()
  })

  it('renders toggle button when content is null but showFooter=true (footer-only aside)', () => {
    render(
      <Wrapper>
        <AsideDrawer showFooter>{null}</AsideDrawer>
      </Wrapper>,
    )

    // showFooter=true → drawer renders so footer is accessible even without custom content
    const button = screen.getByRole('button', { name: 'Toggle page sidebar' })
    expect(button).toBeDefined()
  })

  it('renders toggle button for infinite scroll pages with content', () => {
    render(
      <Wrapper>
        <AsideDrawer showFooter>
          <div>Infinite scroll content</div>
        </AsideDrawer>
      </Wrapper>,
    )

    const button = screen.getByRole('button', { name: 'Toggle page sidebar' })
    expect(button).toBeDefined()
  })

  it('opens Sheet with PageAside when toggle is clicked (mobile)', async () => {
    render(
      <Wrapper>
        <AsideDrawer showFooter>
          <div>Infinite scroll content</div>
        </AsideDrawer>
      </Wrapper>,
    )

    const button = screen.getByRole('button', { name: 'Toggle page sidebar' })
    act(() => {
      fireEvent.click(button)
    })

    expect(screen.getByTestId('page-aside-drawer')).toBeInTheDocument()
  })

  it('resets mobileSheetOpen on mount so stale state from a no-aside route does not pop the drawer', () => {
    // Simulate Cmd+\ on a no-aside route: set mobileSheetOpen=true without AsideDrawer present.
    // Then "navigate" to an aside route by mounting AsideDrawer — it should reset the state.
    function TestHarness({ showDrawer }: { showDrawer: boolean }) {
      const setMobileSheetOpen = useSetMobileSheetOpen()
      return (
        <>
          <button
            type='button'
            onClick={() => setMobileSheetOpen(true)}
            data-testid='prime-sheet'
          >
            prime
          </button>
          {showDrawer && (
            <AsideDrawer showFooter={false}>
              <div>Content</div>
            </AsideDrawer>
          )}
        </>
      )
    }

    const { rerender } = render(
      <AsideProvider>
        <TestHarness showDrawer={false} />
      </AsideProvider>,
    )

    // Mimic Cmd+\ on no-aside route
    act(() => {
      fireEvent.click(screen.getByTestId('prime-sheet'))
    })

    // Navigate to aside route — AsideDrawer mounts and should reset mobileSheetOpen
    rerender(
      <AsideProvider>
        <TestHarness showDrawer />
      </AsideProvider>,
    )

    // Sheet must not pop open
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens Sheet with PageAside when toggle is clicked on mobile for non-infinite page (showFooter=false)', async () => {
    render(
      <Wrapper>
        <AsideDrawer showFooter={false}>
          <div>Non-infinite content</div>
        </AsideDrawer>
      </Wrapper>,
    )

    const button = screen.getByRole('button', { name: 'Toggle page sidebar' })
    act(() => {
      fireEvent.click(button)
    })

    expect(screen.getByTestId('page-aside-drawer')).toBeInTheDocument()
  })
})
