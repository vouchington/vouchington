import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LandingPagesUsernameRequired } from '../landing-pages-manager-sections'
import { updateMyIdentity } from '@/lib/api/client/my'

vi.mock(import('@/lib/api/client/my'), () => ({
  updateMyIdentity: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { error: vi.fn<VitestLooseMock>(), success: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

const mockRouter = { refresh: vi.fn<VitestLooseMock>() }
vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => mockRouter,
    }) as unknown as typeof import('next/navigation'),
)

const mockUpdateMyIdentity = vi.mocked(updateMyIdentity)

describe('LandingPagesUsernameRequired', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the heading, description, and CTA button', () => {
    render(<LandingPagesUsernameRequired />)
    expect(screen.getByRole('heading', { name: /landing pages/i })).toBeDefined()
    expect(screen.getByText(/a username is required/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /choose a username/i })).toBeDefined()
    expect(screen.getByRole('link', { name: /go to identity settings/i })).toBeDefined()
  })

  it('opens the username dialog when the CTA button is clicked', async () => {
    render(<LandingPagesUsernameRequired />)
    fireEvent.click(screen.getByRole('button', { name: /choose a username/i }))
    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /choose a username to create landing pages/i }),
      ).toBeDefined()
    })
  })

  it('closes dialog and calls router.refresh on successful username creation', async () => {
    mockUpdateMyIdentity.mockResolvedValueOnce({} as never)
    render(<LandingPagesUsernameRequired />)

    fireEvent.click(screen.getByRole('button', { name: /choose a username/i }))
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined()
    })

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'newusername' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => {
      expect(mockUpdateMyIdentity).toHaveBeenCalledWith({ username: 'newusername' })
      expect(mockRouter.refresh).toHaveBeenCalledTimes(1)
    })
  })

  it('closes dialog without refresh when Cancel is clicked', async () => {
    render(<LandingPagesUsernameRequired />)

    fireEvent.click(screen.getByRole('button', { name: /choose a username/i }))
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(mockRouter.refresh).not.toHaveBeenCalled()
  })
})
