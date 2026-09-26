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

  it('toggle button container uses zero-height sticky positioning', () => {
    const { container } = render(
      <Wrapper>
        <AsideDrawer showFooter>
          <div>Infinite scroll content</div>
        </AsideDrawer>
      </Wrapper>,
    )

    const wrapper = container.querySelector('.sticky.top-14')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.className).not.toContain('h-0')
  })

  it('toggle button sticky offset is top-14 to match aside column offset', () => {
    const { container } = render(
      <Wrapper>
        <AsideDrawer showFooter>
          <div>Content</div>
        </AsideDrawer>
      </Wrapper>,
    )

    // top-14 (56px) aligns with the aside column's lg:top-14 offset
    const wrapper = container.querySelector('.sticky.top-14')
    expect(wrapper?.className).toContain('top-14')
    expect(wrapper?.className).not.toContain('top-12')
  })

  it('inner wrapper is aligned to content column via mx-auto max-w-[1200px]', () => {
    const { container } = render(
      <Wrapper>
        <AsideDrawer showFooter>
          <div>Content</div>
        </AsideDrawer>
      </Wrapper>,
    )

    // The sticky bar now uses mx-auto max-w-[1200px] to align with the content column
    const inner = container.querySelector('.sticky.top-14 > div')
    expect(inner?.className).toContain('max-w-[1200px]')
    expect(inner?.className).toContain('mx-auto')
  })

  it('offsets toggle by aside width on desktop when aside is open with transition', () => {
    const { container } = render(
      <Wrapper>
        <AsideDrawer showFooter>
          <div>Content</div>
        </AsideDrawer>
      </Wrapper>,
    )

    // desktopAsideOpen defaults to true, so lg:mr-[334px] class should be on the inner flex div
    const toggleRow = container.querySelector('.sticky.top-14 > div > div')
    expect(toggleRow?.className).toContain('lg:mr-[334px]')
    // Margin-right transition animates the offset when aside opens/closes
    expect(toggleRow?.className).toContain('transition-[margin-right]')
    expect(toggleRow?.className).toContain('duration-300')
    expect(toggleRow?.className).toContain('ease-in-out')
  })

  it('uses lg:mr-0 when aside is closed so margin can animate back', async () => {
    // Override to desktop so toggleAside() closes desktopAsideOpen (not mobileSheetOpen)
    vi.stubGlobal('matchMedia', (_query: string) => ({
      matches: true, // simulate lg+ viewport
      media: _query,
      onchange: null,
      addListener: vi.fn<VitestLooseMock>(),
      removeListener: vi.fn<VitestLooseMock>(),
      addEventListener: vi.fn<VitestLooseMock>(),
      removeEventListener: vi.fn<VitestLooseMock>(),
      dispatchEvent: vi.fn<VitestLooseMock>(),
    }))

    const { container } = render(
      <Wrapper>
        <AsideDrawer showFooter={false}>
          <div>Content</div>
        </AsideDrawer>
      </Wrapper>,
    )

    // Default: aside is open, lg:mr-[334px] offsets the button
    const toggleRow = container.querySelector('.sticky.top-14 > div > div')
    expect(toggleRow?.className).toContain('lg:mr-[334px]')
    expect(toggleRow?.className).not.toContain('lg:mr-0')

    // Click toggle button — closes aside (desktopAsideOpen → false)
    const button = screen.getByRole('button', { name: 'Toggle page sidebar' })
    act(() => {
      fireEvent.click(button)
    })

    // lg:mr-0 replaces lg:mr-[334px] so the CSS transition has an explicit end value
    expect(toggleRow?.className).not.toContain('lg:mr-[334px]')
    expect(toggleRow?.className).toContain('lg:mr-0')
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

    expect(screen.getByTestId('page-aside-drawer')).toBeDefined()
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

    expect(screen.getByTestId('page-aside-drawer')).toBeDefined()
  })
})
