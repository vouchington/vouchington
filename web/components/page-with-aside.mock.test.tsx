import React, { memo, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageWithAside } from './page-with-aside'

vi.mock(import('@/components/aside-column'), () => ({
  AsideColumn: ({ children }: { children?: ReactNode }) => (
    <div data-testid='aside-column'>{children}</div>
  ),
}))

vi.mock(import('@/components/aside-drawer'), () => ({
  AsideDrawer: ({ children }: { children?: ReactNode }) => (
    <div data-testid='aside-drawer'>{children}</div>
  ),
}))

vi.mock(
  import('@/components/layout/content-container'),
  () =>
    ({
      ContentContainer: ({
        children,
        className,
        ...props
      }: {
        children?: ReactNode
        className?: string
        [key: string]: unknown
      }) => (
        <div
          className={className}
          {...props}
        >
          {children}
        </div>
      ),
    }) as unknown as typeof import('@/components/layout/content-container'),
)

function TestAside() {
  return <div>sidebar</div>
}

function TestAsideContent() {
  return <div>sidebar content</div>
}

const MemoAside = memo(TestAsideContent)

function ForwardRefAside({ ref }: { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref}>forward ref sidebar</div>
}

describe('PageWithAside', () => {
  it('renders page-content-wrapper test id', () => {
    const { container } = render(<PageWithAside>content</PageWithAside>)
    expect(container.querySelector('[data-pw="page-content-wrapper"]')).not.toBeNull()
  })

  it('wraps children in the main min-w-0 column', () => {
    const { container } = render(<PageWithAside>content</PageWithAside>)
    const wrapper = container.querySelector('.min-w-0')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.textContent).toBe('content')
  })

  describe('without aside', () => {
    it('does not render AsideDrawer when aside is omitted', () => {
      render(<PageWithAside>content</PageWithAside>)
      expect(screen.queryByTestId('aside-drawer')).toBeNull()
    })

    it('does not render AsideColumn when aside is omitted', () => {
      render(<PageWithAside>content</PageWithAside>)
      expect(screen.queryByTestId('aside-column')).toBeNull()
    })

    it('does not render AsideDrawer when aside is null', () => {
      render(<PageWithAside aside={null}>content</PageWithAside>)
      expect(screen.queryByTestId('aside-drawer')).toBeNull()
    })

    it('does not render AsideDrawer when aside is false', () => {
      render(<PageWithAside aside={false as unknown as ReactNode}>content</PageWithAside>)
      expect(screen.queryByTestId('aside-drawer')).toBeNull()
    })

    it('does not apply lg:flex-row to the content wrapper when aside is omitted', () => {
      const { container } = render(<PageWithAside>content</PageWithAside>)
      const wrapper = container.querySelector('[data-pw="page-content-wrapper"]')
      expect(wrapper).not.toBeNull()
      expect(wrapper!.className).not.toContain('lg:flex-row')
    })

    it('does not apply lg:flex-row to the content wrapper when aside is null', () => {
      const { container } = render(<PageWithAside aside={null}>content</PageWithAside>)
      const wrapper = container.querySelector('[data-pw="page-content-wrapper"]')
      expect(wrapper).not.toBeNull()
      expect(wrapper!.className).not.toContain('lg:flex-row')
    })
  })

  describe('with aside', () => {
    it('renders AsideDrawer', () => {
      render(<PageWithAside aside={TestAside}>content</PageWithAside>)
      expect(screen.getByTestId('aside-drawer')).toBeDefined()
    })

    it('renders AsideColumn', () => {
      render(<PageWithAside aside={TestAside}>content</PageWithAside>)
      expect(screen.getByTestId('aside-column')).toBeDefined()
    })

    it('passes aside content to both AsideDrawer and AsideColumn', () => {
      render(<PageWithAside aside={TestAsideContent}>main</PageWithAside>)
      const texts = screen.getAllByText('sidebar content')
      expect(texts).toHaveLength(2)
    })

    it('renders memo and forwardRef component asides', () => {
      render(
        <>
          <PageWithAside aside={MemoAside}>main</PageWithAside>
          <PageWithAside aside={ForwardRefAside}>main</PageWithAside>
        </>,
      )

      expect(screen.getAllByText('sidebar content')).toHaveLength(2)
      expect(screen.getAllByText('forward ref sidebar')).toHaveLength(2)
    })

    it('passes array asides through as React nodes', () => {
      render(
        <PageWithAside aside={[<span key='a'>first</span>, <span key='b'>second</span>]}>
          main
        </PageWithAside>,
      )

      expect(screen.getAllByText('first')).toHaveLength(2)
      expect(screen.getAllByText('second')).toHaveLength(2)
    })
  })
})
