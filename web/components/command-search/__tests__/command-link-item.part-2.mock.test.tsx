import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { navMockModule } from '@/test-helpers/next-navigation-mock'
import { Command, CommandList } from '@/components/ui/command'
import { CommandLinkItem } from '../command-link-item'

vi.mock(import('next/navigation'), () => navMockModule)
vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        href,
        children,
        prefetch: _prefetch,
        ...props
      }: {
        href: string
        children: React.ReactNode
        prefetch?: boolean
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

describe('CommandLinkItem authored language', () => {
  it('renders a display fallback without authored language attributes', () => {
    render(
      <Command shouldFilter={false}>
        <CommandList>
          <CommandLinkItem
            href='/discussion/post-1'
            external={false}
            label={{
              kind: 'post-content',
              content: {
                text: null,
                declared_language: 'ar',
                lingua_rs_detected_language: 'en',
              },
              fallback: 'Untitled Post',
            }}
            sublabel='Discussion'
            onOpenChange={vi.fn<(open: boolean) => void>()}
            pushRoute={vi.fn<(href: string) => void>()}
          />
        </CommandList>
      </Command>,
    )

    expect(screen.getByText('Untitled Post')).not.toHaveAttribute('lang')
    expect(screen.getByText('Untitled Post')).not.toHaveAttribute('dir')
  })
})
