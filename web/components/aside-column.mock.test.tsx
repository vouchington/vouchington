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

    expect(screen.getByRole('complementary')).toBeInTheDocument()
    expect(screen.getByTestId('page-aside')).toBeInTheDocument()
  })

  it('renders when showFooter is true even without explicit content', () => {
    render(
      <Wrapper>
        <AsideColumn showFooter>{null}</AsideColumn>
      </Wrapper>,
    )

    expect(screen.getByRole('complementary')).toBeInTheDocument()
  })

  it('makes the aside inert when toggled closed but keeps subtree mounted', async () => {
    const { container } = render(
      <Wrapper>
        <ToggleButton />
        <AsideColumn showFooter={false}>
          <div>Content</div>
        </AsideColumn>
      </Wrapper>,
    )

    // Default: desktopAsideOpen=true — open, no inert
    const aside = screen.getByRole('complementary')
    expect(aside.getAttribute('inert')).toBeNull()

    // Toggle closed — collapse the aside
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
    })

    // The aside element must still be in the DOM so stateful aside children stay mounted.
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    // inert attribute set so keyboard/AT cannot reach focusable descendants
    expect(aside.getAttribute('inert')).toBe('')
    // PageAside child remains mounted
    expect(container.querySelector('[data-testid="page-aside"]')).not.toBeNull()
  })
})
