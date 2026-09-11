import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { onSuccess } from '../on-success'

type SonnerModule = typeof import('sonner')

vi.mock(import('sonner'), () => {
  const toastMock = Object.assign(vi.fn<SonnerModule['toast']>(), {
    error: vi.fn<SonnerModule['toast']['error']>(),
    success: vi.fn<SonnerModule['toast']['success']>(),
  }) as SonnerModule['toast']
  return { toast: toastMock }
})

const mockedToast = vi.mocked(toast)

describe('onSuccess', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('calls toast.success with the message and no options when description is absent', () => {
    onSuccess('Saved')
    expect(mockedToast.success).toHaveBeenCalledWith('Saved')
  })

  it('passes description through to toast.success', () => {
    onSuccess('Saved', { description: 'Your changes are live' })
    expect(mockedToast.success).toHaveBeenCalledWith('Saved', {
      description: 'Your changes are live',
    })
  })
})
