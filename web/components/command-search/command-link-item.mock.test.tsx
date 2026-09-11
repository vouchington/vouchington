import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { navMockModule } from '@/test-helpers/next-navigation-mock'
import { Command, CommandList } from '@/components/ui/command'
import { CommandLinkItem } from './command-link-item'
vi.mock(import('next/navigation'), () => navMockModule)
vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        href,
        children,
        prefetch: _prefetch, // not a valid <a> attribute; stripped to silence jsdom warning
        ...props
      }: {
        href: string
        children: React.ReactNode
        prefetch?: boolean
        onClick?: React.MouseEventHandler
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <Command shouldFilter={false}>
      <CommandList>{children}</CommandList>
    </Command>
  )
}

describe('CommandLinkItem — internal link', () => {
  it('renders a real anchor with correct href', () => {
    render(
      <Wrapper>
        <CommandLinkItem
          href='/topics/create'
          external={false}
          label={{ kind: 'ui-text', text: 'Create Topic' }}
          sublabel='/topics/create'
          onOpenChange={vi.fn<(open: boolean) => void>()}
          pushRoute={vi.fn<(href: string) => void>()}
        />
      </Wrapper>,
    )

    const anchor = screen.getByRole('option')
    expect(anchor.tagName).toBe('A')
    expect(anchor).toHaveAttribute('href', '/topics/create')
  })

  it('navigates with pushRoute and closes on plain click', () => {
    const onOpenChange = vi.fn<(open: boolean) => void>()
    const pushRoute = vi.fn<(href: string) => void>()

    render(
      <Wrapper>
        <CommandLinkItem
          href='/topics/create'
          external={false}
          label={{ kind: 'ui-text', text: 'Create Topic' }}
          sublabel='/topics/create'
          onOpenChange={onOpenChange}
          pushRoute={pushRoute}
        />
      </Wrapper>,
    )

    fireEvent.click(screen.getByRole('option'))

    expect(pushRoute).toHaveBeenCalledWith('/topics/create')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('does not navigate on Cmd+click — lets browser open new tab', () => {
    const onOpenChange = vi.fn<(open: boolean) => void>()
    const pushRoute = vi.fn<(href: string) => void>()

    render(
      <Wrapper>
        <CommandLinkItem
          href='/topics/create'
          external={false}
          label={{ kind: 'ui-text', text: 'Create Topic' }}
          sublabel='/topics/create'
          onOpenChange={onOpenChange}
          pushRoute={pushRoute}
        />
      </Wrapper>,
    )

    fireEvent.click(screen.getByRole('option'), { metaKey: true })

    expect(pushRoute).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('does not navigate on Ctrl+click — lets browser open new tab', () => {
    const onOpenChange = vi.fn<(open: boolean) => void>()
    const pushRoute = vi.fn<(href: string) => void>()

    render(
      <Wrapper>
        <CommandLinkItem
          href='/topics/create'
          external={false}
          label={{ kind: 'ui-text', text: 'Create Topic' }}
          sublabel='/topics/create'
          onOpenChange={onOpenChange}
          pushRoute={pushRoute}
        />
      </Wrapper>,
    )

    fireEvent.click(screen.getByRole('option'), { ctrlKey: true })

    expect(pushRoute).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('does not navigate on middle-click — lets browser open new tab', () => {
    const onOpenChange = vi.fn<(open: boolean) => void>()
    const pushRoute = vi.fn<(href: string) => void>()

    render(
      <Wrapper>
        <CommandLinkItem
          href='/topics/create'
          external={false}
          label={{ kind: 'ui-text', text: 'Create Topic' }}
          sublabel='/topics/create'
          onOpenChange={onOpenChange}
          pushRoute={pushRoute}
        />
      </Wrapper>,
    )

    fireEvent.click(screen.getByRole('option'), { button: 1 })

    expect(pushRoute).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('navigates with pushRoute and closes on keyboard Enter (cmdk-item-select)', () => {
    const onOpenChange = vi.fn<(open: boolean) => void>()
    const pushRoute = vi.fn<(href: string) => void>()

    render(
      <Wrapper>
        <CommandLinkItem
          href='/topics/create'
          external={false}
          label={{ kind: 'ui-text', text: 'Create Topic' }}
          sublabel='/topics/create'
          onOpenChange={onOpenChange}
          pushRoute={pushRoute}
        />
      </Wrapper>,
    )

    const anchor = screen.getByRole('option')
    fireEvent(anchor, new Event('cmdk-item-select'))

    expect(pushRoute).toHaveBeenCalledWith('/topics/create')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders a data-pw attribute on the option element', () => {
    render(
      <Wrapper>
        <CommandLinkItem
          href='/sources'
          external={false}
          dataPw='search-page-shortcut-sources'
          label={{ kind: 'ui-text', text: 'Sources' }}
          sublabel='/sources'
          onOpenChange={vi.fn<(open: boolean) => void>()}
          pushRoute={vi.fn<(href: string) => void>()}
        />
      </Wrapper>,
    )

    expect(screen.getByRole('option')).toHaveAttribute('data-pw', 'search-page-shortcut-sources')
  })
})

describe('CommandLinkItem — external link', () => {
  it('renders a real anchor with target="_blank" and rel', () => {
    render(
      <Wrapper>
        <CommandLinkItem
          href='https://example.com/article'
          external
          label={{ kind: 'ui-text', text: 'Example Article' }}
          sublabel='Example Feed'
          onOpenChange={vi.fn<(open: boolean) => void>()}
        />
      </Wrapper>,
    )

    const anchor = screen.getByRole('option')
    expect(anchor.tagName).toBe('A')
    expect(anchor).toHaveAttribute('href', 'https://example.com/article')
    expect(anchor).toHaveAttribute('target', '_blank')
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('closes dialog on plain click — anchor already opened the tab', () => {
    const onOpenChange = vi.fn<(open: boolean) => void>()
    const windowOpenSpy = vi.spyOn(window, 'open').mockReturnValue(null)

    render(
      <Wrapper>
        <CommandLinkItem
          href='https://example.com/article'
          external
          label={{ kind: 'ui-text', text: 'Example Article' }}
          sublabel='Example Feed'
          onOpenChange={onOpenChange}
        />
      </Wrapper>,
    )

    fireEvent.click(screen.getByRole('option'))

    expect(windowOpenSpy).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)

    windowOpenSpy.mockRestore()
  })

  it('activates the native anchor once and closes once on keyboard Enter', () => {
    const onOpenChange = vi.fn<(open: boolean) => void>()
    const windowOpenSpy = vi.spyOn(window, 'open').mockReturnValue(null)

    render(
      <Wrapper>
        <CommandLinkItem
          href='https://example.com/article'
          external
          label={{ kind: 'ui-text', text: 'Example Article' }}
          sublabel='Example Feed'
          onOpenChange={onOpenChange}
        />
      </Wrapper>,
    )

    const anchor = screen.getByRole('option')
    const anchorClickSpy = vi.spyOn(anchor, 'click')
    fireEvent(anchor, new Event('cmdk-item-select'))

    expect(anchorClickSpy).toHaveBeenCalledOnce()
    expect(windowOpenSpy).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false)

    windowOpenSpy.mockRestore()
  })

  it('does not navigate on Cmd+click', () => {
    const onOpenChange = vi.fn<(open: boolean) => void>()
    const windowOpenSpy = vi.spyOn(window, 'open').mockReturnValue(null)

    render(
      <Wrapper>
        <CommandLinkItem
          href='https://example.com/article'
          external
          label={{ kind: 'ui-text', text: 'Example Article' }}
          sublabel='Example Feed'
          onOpenChange={onOpenChange}
        />
      </Wrapper>,
    )

    fireEvent.click(screen.getByRole('option'), { metaKey: true })

    expect(windowOpenSpy).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()

    windowOpenSpy.mockRestore()
  })
})
