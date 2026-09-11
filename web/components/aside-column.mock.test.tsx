import type { ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { AsideColumn } from './aside-column'
import { AsideProvider } from '@/lib/aside-provider'
import { useToggleAside } from '@/lib/aside-context'

vi.mock(import('@/components/page-aside'), () => ({
  PageAside: () => <div data-testid='page-aside'>Page aside content</div>,
}))

/** toggleAside() reads window.matchMedia; provide a minimal desktop stub so jsdom doesn't throw */
function mockMatchMediaDesktop() {
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
}

function ToggleButton() {
  const toggle = useToggleAside()
  return (
    <button
      type='button'
      onClick={toggle}
    >
      toggle
    </button>
  )
}

function Wrapper({ children }: { children: ReactNode }) {
  return <AsideProvider>{children}</AsideProvider>
}

describe('AsideColumn', () => {
  beforeEach(() => {
    mockMatchMediaDesktop()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when no content and showFooter=false', () => {
    const { container } = render(
      <Wrapper>
        <AsideColumn />
      </Wrapper>,
    )
    expect(container.querySelector('aside')).toBeNull()
  })

  it('renders aside when children are provided', () => {
    render(
      <Wrapper>
        <AsideColumn showFooter={false}>
          <div>Content</div>
        </AsideColumn>
      </Wrapper>,
    )

    expect(screen.getByRole('complementary')).toBeDefined()
    expect(screen.getByTestId('page-aside')).toBeDefined()
  })

  it('hides aside on mobile for infinite scroll pages', () => {
    render(
      <Wrapper>
        <AsideColumn showFooter>
          <div>Infinite scroll content</div>
        </AsideColumn>
      </Wrapper>,
    )

    const aside = screen.getByRole('complementary')
    expect(aside.className).toContain('hidden')
    expect(aside.className).toContain('lg:block')
  })

  it('renders full-width aside on mobile for non-infinite pages', () => {
    render(
      <Wrapper>
        <AsideColumn showFooter={false}>
          <div>Non-infinite content</div>
        </AsideColumn>
      </Wrapper>,
    )

    const aside = screen.getByRole('complementary')
    expect(aside.className).toContain('w-full')
    expect(aside.className).not.toContain('hidden lg:block')
  })

  it('hides aside on mobile when mobileHidden is true', () => {
    render(
      <Wrapper>
        <AsideColumn
          showFooter={false}
          mobileHidden
        >
          <div>Content</div>
        </AsideColumn>
      </Wrapper>,
    )

    const aside = screen.getByRole('complementary')
    expect(aside.className).toContain('hidden')
    expect(aside.className).toContain('lg:block')
    expect(aside.className).not.toContain('w-full')
  })

  it('applies desktop width classes when aside is open', () => {
    render(
      <Wrapper>
        <AsideColumn showFooter={false}>
          <div>Content</div>
        </AsideColumn>
      </Wrapper>,
    )

    const aside = screen.getByRole('complementary')
    expect(aside.className).toContain('lg:w-[334px]')
    expect(aside.className).toContain('lg:min-w-[334px]')

    const inner = aside.firstElementChild as HTMLElement
    expect(inner.className).toContain('lg:w-[334px]')
    expect(inner.className).toContain('lg:translate-x-0')
  })

  it('renders when showFooter is true even without explicit content', () => {
    render(
      <Wrapper>
        <AsideColumn showFooter>{null}</AsideColumn>
      </Wrapper>,
    )

    expect(screen.getByRole('complementary')).toBeDefined()
  })

  it('ScrollArea uses definite height (not max-height) so Radix Viewport can scroll', () => {
    const { container } = render(
      <Wrapper>
        <AsideColumn showFooter={false}>
          <div>Content</div>
        </AsideColumn>
      </Wrapper>,
    )

    // ScrollArea renders with 'relative overflow-hidden' plus the passed className.
    // Must use lg:h-[...] (definite height) not lg:max-h-[...] so that Radix
    // ScrollAreaPrimitive.Viewport's h-full resolves to a real value and scrolling works.
    const scrollRoot = container.querySelector('.overflow-hidden.relative')
    expect(scrollRoot).not.toBeNull()
    expect(scrollRoot?.className).toContain('lg:h-[calc(100dvh-5rem)]')
    expect(scrollRoot?.className).not.toContain('lg:max-h-[calc(100dvh-5rem)]')
  })

  it('collapses aside width and translates inner off-screen when toggled closed but keeps subtree mounted', async () => {
    const { container } = render(
      <Wrapper>
        <ToggleButton />
        <AsideColumn showFooter={false}>
          <div>Content</div>
        </AsideColumn>
      </Wrapper>,
    )

    // Default: desktopAsideOpen=true — open width classes, no inert
    const aside = screen.getByRole('complementary')
    expect(aside.className).toContain('lg:w-[334px]')
    expect(aside.className).not.toContain('lg:w-0')
    expect(aside.getAttribute('inert')).toBeNull()

    // Toggle closed — switches to zero-width collapse, not display:none
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
    })

    // The aside element must still be in the DOM so stateful aside children stay mounted.
    expect(screen.getByRole('complementary')).not.toBeNull()
    // Width-based collapse on desktop: w-0 and min-w-0 animate the aside out of view
    expect(aside.className).toContain('lg:w-0')
    expect(aside.className).toContain('lg:min-w-0')
    // No display:none — aside stays in DOM at all viewports; mobile toggle uses Sheet drawer
    expect(aside.className).not.toContain(' lg:hidden')
    expect(aside.className).not.toContain('max-lg:hidden')
    // Inner wrapper translates off-screen (horizontal shift) rather than shrinking
    const inner = aside.firstElementChild as HTMLElement
    expect(inner.className).toContain('lg:translate-x-full')
    expect(inner.className).not.toContain('lg:translate-x-0')
    // inert attribute set so keyboard/AT cannot reach focusable descendants
    expect(aside.getAttribute('inert')).toBe('')
    // PageAside child remains mounted
    expect(container.querySelector('[data-testid="page-aside"]')).not.toBeNull()
  })

  it('has transition classes for animated open/close', () => {
    render(
      <Wrapper>
        <AsideColumn showFooter={false}>
          <div>Content</div>
        </AsideColumn>
      </Wrapper>,
    )

    const aside = screen.getByRole('complementary')
    // Outer: width+margin collapse so layout reflows
    expect(aside.className).toContain('transition-[width,min-width,margin-left]')
    expect(aside.className).toContain('duration-300')
    expect(aside.className).toContain('ease-in-out')
    // Inner: translate-based horizontal shift so content slides off-screen at fixed width
    const inner = aside.firstElementChild as HTMLElement
    expect(inner.className).toContain('transition-transform')
    expect(inner.className).toContain('duration-300')
    expect(inner.className).toContain('ease-in-out')
  })

  it('uses overflow-clip to contain content during width animation without breaking sticky', () => {
    render(
      <Wrapper>
        <AsideColumn showFooter={false}>
          <div>Content</div>
        </AsideColumn>
      </Wrapper>,
    )

    // overflow-clip clips content during animation but (unlike overflow-hidden) does NOT create a
    // scroll container, so position:sticky on the inner div continues to work correctly.
    const aside = screen.getByRole('complementary')
    expect(aside.className).toContain('overflow-clip')
    expect(aside.className).not.toContain('overflow-hidden')
  })
})
