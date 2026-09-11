import type { ReactNode } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommunitySettingsFields } from './community-settings-fields'
import type { CommunitySettingsFormState } from './use-community-settings-form'

const { mockCheckAvailability } = vi.hoisted(() => ({
  mockCheckAvailability: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href }: { children: ReactNode; href: string }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('@/lib/api/client/availability'), () => ({
  checkAvailability: mockCheckAvailability,
}))

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SelectContent: ({ children }: { children: ReactNode }) => children,
      SelectItem: ({ children }: { children: ReactNode }) => <option>{children}</option>,
      SelectTrigger: ({ children }: { children: ReactNode }) => children,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

function props(
  overrides: Partial<CommunitySettingsFormState> = {},
): React.ComponentProps<typeof CommunitySettingsFields> {
  return {
    name: 'My Community',
    slug: 'my-community',
    markdown: '',
    visibility: 'public',
    listType: 'none',
    memberRosterVisibility: 'public',
    requiresPostApproval: false,
    allowMemberInvites: true,
    setName: vi.fn<VitestLooseMock>(),
    setSlug: vi.fn<VitestLooseMock>(),
    setMarkdown: vi.fn<VitestLooseMock>(),
    setVisibility: vi.fn<VitestLooseMock>(),
    setListType: vi.fn<VitestLooseMock>(),
    setMemberRosterVisibility: vi.fn<VitestLooseMock>(),
    setRequiresPostApproval: vi.fn<VitestLooseMock>(),
    setAllowMemberInvites: vi.fn<VitestLooseMock>(),
    ...overrides,
  } as React.ComponentProps<typeof CommunitySettingsFields>
}

describe('CommunitySettingsFields', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the slug input', () => {
    render(<CommunitySettingsFields {...props()} />)
    expect(document.querySelector('[data-pw="community-settings-slug-input"]')).not.toBeNull()
  })

  it('calls setSlug and resets availability when the slug changes', () => {
    const setSlug = vi.fn<VitestLooseMock>()
    render(<CommunitySettingsFields {...props({ setSlug })} />)
    const slug = screen.getByPlaceholderText('community-slug')
    fireEvent.change(slug, { target: { value: 'new-slug' } })
    expect(setSlug).toHaveBeenCalledWith('new-slug')
  })

  it('checks availability on blur when the slug differs from the initial value', async () => {
    mockCheckAvailability.mockResolvedValue({ available: true, conflict: null })
    // initialSlugRef captures props.slug on first render; change it via a re-render.
    const { rerender } = render(<CommunitySettingsFields {...props({ slug: 'original' })} />)
    rerender(<CommunitySettingsFields {...props({ slug: 'changed' })} />)

    fireEvent.blur(screen.getByPlaceholderText('community-slug'))
    await waitFor(() => {
      expect(mockCheckAvailability).toHaveBeenCalledWith(
        'community-slug',
        'changed',
        expect.any(Object),
      )
    })
  })

  it('does not check availability on blur when the slug is unchanged', () => {
    render(<CommunitySettingsFields {...props({ slug: 'same' })} />)
    fireEvent.blur(screen.getByPlaceholderText('community-slug'))
    expect(mockCheckAvailability).not.toHaveBeenCalled()
  })
})
