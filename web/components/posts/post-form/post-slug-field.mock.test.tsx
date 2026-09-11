import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PostSlugField } from './post-slug-field'

const { mockUseAuth, mockCheckAvailability } = vi.hoisted(() => ({
  mockUseAuth: vi.fn<VitestLooseMock>(),
  mockCheckAvailability: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/context'), () => ({
  useAuth: mockUseAuth,
}))

vi.mock(import('@/lib/api/client/availability'), () => ({
  checkAvailability: mockCheckAvailability,
}))

function asNonAdmin() {
  mockUseAuth.mockReturnValue({ currentUser: { id: 'u1', roles: [] } })
}
function asAdmin() {
  mockUseAuth.mockReturnValue({ currentUser: { id: 'u1', roles: ['administrator'] } })
}

describe('PostSlugField', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing for a non-admin user', () => {
    asNonAdmin()
    const { container } = render(
      <PostSlugField
        initialSlug=''
        onSlugChange={() => {}}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the slug input for an admin user', () => {
    asAdmin()
    render(
      <PostSlugField
        initialSlug='my-slug'
        onSlugChange={() => {}}
      />,
    )
    const input = screen.getByLabelText('Slug (admin only)')
    expect(input).toHaveValue('my-slug')
    expect(input.getAttribute('data-pw')).toBe('post-form-slug-input')
  })

  it('calls onSlugChange when typing', () => {
    asAdmin()
    const changes: string[] = []
    render(
      <PostSlugField
        initialSlug=''
        onSlugChange={v => changes.push(v)}
      />,
    )
    fireEvent.change(screen.getByLabelText('Slug (admin only)'), {
      target: { value: 'new-slug' },
    })
    expect(changes).toContain('new-slug')
  })

  it('runs the availability check on blur when the slug changed', async () => {
    asAdmin()
    mockCheckAvailability.mockResolvedValue({ available: true, conflict: null })
    render(
      <PostSlugField
        initialSlug='original'
        onSlugChange={() => {}}
      />,
    )
    const input = screen.getByLabelText('Slug (admin only)')
    fireEvent.change(input, { target: { value: 'changed' } })
    fireEvent.blur(input)
    await waitFor(() => {
      expect(mockCheckAvailability).toHaveBeenCalledWith('post-slug', 'changed', expect.any(Object))
    })
  })

  it('does not check availability on blur when the slug is unchanged', () => {
    asAdmin()
    render(
      <PostSlugField
        initialSlug='same'
        onSlugChange={() => {}}
      />,
    )
    fireEvent.blur(screen.getByLabelText('Slug (admin only)'))
    expect(mockCheckAvailability).not.toHaveBeenCalled()
  })
})
