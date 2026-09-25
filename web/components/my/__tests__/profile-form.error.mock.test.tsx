import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock(import('@/lib/api/client'), () => ({
  updateMyProfile: vi.fn<VitestLooseMock>(),
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
  default: (_err: unknown, options: { fallback: string }) => {
    toastMock.error(options.fallback)
    return options.fallback
  },
  onSuccess: (message: string) => {
    toastMock.success(message)
  },
}))

import { ProfileForm } from '../profile-form'
import { updateMyProfile } from '@/lib/api/client'

const mockUpdateMyProfile = vi.mocked(updateMyProfile)

describe('ProfileForm error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports submit failures via onError fallback', async () => {
    mockUpdateMyProfile.mockRejectedValueOnce(new Error('Update failed'))

    render(<ProfileForm initialMarkdown='hello' />)
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to update profile')
    })
  })
})
