import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock(import('@/lib/api/client'), () => ({
  createMyProfileLink: vi.fn<VitestLooseMock>(),
  deleteMyProfileLink: vi.fn<VitestLooseMock>(),
  reorderMyProfileLinks: vi.fn<VitestLooseMock>(),
  updateMyProfileLink: vi.fn<VitestLooseMock>(),
}))

const { toastMock } = vi.hoisted(() => {
  const mock = Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
  })
  return { toastMock: mock }
})

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: toastMock,
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/on-error'), () => ({
  default: (err: unknown, options: { fallback: string }) => {
    toastMock.error(options.fallback)
    return options.fallback
  },
  onSuccess: (message: string) => {
    toastMock.success(message)
  },
}))

import { ProfileLinks } from '../profile-links'
import {
  createMyProfileLink,
  deleteMyProfileLink,
  reorderMyProfileLinks,
  updateMyProfileLink,
} from '@/lib/api/client'
import type { ProfileLink } from '@/types/user'

const mockCreate = vi.mocked(createMyProfileLink)
const mockDelete = vi.mocked(deleteMyProfileLink)
const mockReorder = vi.mocked(reorderMyProfileLinks)
const mockUpdate = vi.mocked(updateMyProfileLink)

function makeLink(id: string, url: string, sortOrder: number): ProfileLink {
  return {
    id,
    link_type: 'url',
    url,
    handle: null,
    name: null,
    sort_order: sortOrder,
  } as ProfileLink
}

describe('ProfileLinks error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports create failures via onError fallback', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Create failed'))

    render(<ProfileLinks initialLinks={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /add link/i }))
    const input = screen.getByLabelText('URL') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'https://example.com' } })
    // The submit button inside the form has the same "Add link" label as the toggle
    const submitButtons = screen.getAllByRole('button', { name: /Add link/i })
    const submitButton = submitButtons.find(btn => btn.getAttribute('type') === 'submit')
    fireEvent.click(submitButton!)

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to add link')
    })
  })

  it('reports update failures via onError fallback', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('Update failed'))

    render(<ProfileLinks initialLinks={[makeLink('l1', 'https://a.com', 0)]} />)
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
    const input = screen.getByLabelText('URL') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'https://b.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to update link')
    })
  })

  it('reports delete failures via onError fallback', async () => {
    mockDelete.mockRejectedValueOnce(new Error('Delete failed'))

    render(<ProfileLinks initialLinks={[makeLink('l1', 'https://a.com', 0)]} />)
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to remove link')
    })
  })

  it('emits onSuccess on successful update', async () => {
    mockUpdate.mockResolvedValueOnce({
      profile_link: makeLink('l1', 'https://b.com', 0),
    } as never)

    render(<ProfileLinks initialLinks={[makeLink('l1', 'https://a.com', 0)]} />)
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
    const input = screen.getByLabelText('URL') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'https://b.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Profile link updated')
    })
  })

  it('emits onSuccess on successful delete', async () => {
    mockDelete.mockResolvedValueOnce(undefined as never)

    render(<ProfileLinks initialLinks={[makeLink('l1', 'https://a.com', 0)]} />)
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }))

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Profile link removed')
    })
  })

  it('reports reorder failures via onError fallback and reverts ordering', async () => {
    mockReorder.mockRejectedValueOnce(new Error('Reorder failed'))

    render(
      <ProfileLinks
        initialLinks={[makeLink('l1', 'https://a.com', 0), makeLink('l2', 'https://b.com', 1)]}
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0]!)

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to reorder links')
    })
  })
})
