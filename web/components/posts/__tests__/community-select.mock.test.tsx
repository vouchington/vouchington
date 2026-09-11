import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CommunitySelect } from '../post-form/community-select'

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        onValueChange,
        children,
      }: {
        onValueChange?: (value: string) => void
        children?: React.ReactNode
      }) => (
        <div>
          {children}
          <button
            type='button'
            onClick={() => onValueChange?.('__global__')}
          >
            Choose global
          </button>
          <button
            type='button'
            onClick={() => onValueChange?.('private-community')}
          >
            Choose private
          </button>
        </div>
      ),
      SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      SelectTrigger: ({ children }: { children: React.ReactNode }) => (
        <button type='button'>{children}</button>
      ),
      SelectValue: () => <span>Select community</span>,
    }) as unknown as typeof import('@/components/ui/select'),
)

describe('CommunitySelect', () => {
  it('renders nothing when there are no eligible communities', () => {
    const { container } = render(
      <CommunitySelect
        communities={[]}
        value=''
        onValueChange={vi.fn<(value: string) => void>()}
      />,
    )

    expect(container.firstChild).toBeNull()
  })

  it('maps the global sentinel back to an empty slug', () => {
    const onValueChange = vi.fn<(value: string) => void>()
    render(
      <CommunitySelect
        communities={[
          {
            id: 'community-1',
            name: 'Private Community',
            slug: 'private-community',
            visibility: 'private',
            post_approval_required_at: null,
          },
        ]}
        value='private-community'
        onValueChange={onValueChange}
      />,
    )

    fireEvent.click(screen.getByText('Choose global'))
    fireEvent.click(screen.getByText('Choose private'))

    expect(onValueChange).toHaveBeenNthCalledWith(1, '')
    expect(onValueChange).toHaveBeenNthCalledWith(2, 'private-community')
  })
})
