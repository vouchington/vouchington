import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import { IdentityForm } from '../identity-form'

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: {
        success: vi.fn<VitestLooseMock>(),
        error: vi.fn<VitestLooseMock>(),
        info: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/api/client'), () => ({
  updateMyIdentity: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/shared/image-upload-button'), () => ({
  ImageUploadButton: () => <button type='button'>Upload image</button>,
}))

vi.mock(import('@/components/shared/user-avatar'), () => ({
  UserAvatar: () => <div />,
}))

import { updateMyIdentity } from '@/lib/api/client'

const mockUpdateMyIdentity = vi.mocked(updateMyIdentity)

const baseProps = {
  initialUsername: 'olduser',
  initialProfileImageId: null,
  initialUseDisplayNameFrom: 'username' as const,
  initialFacebookAccount: null,
  hasOAuthAccount: false,
}

describe('IdentityForm keyboard submit', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockUpdateMyIdentity.mockResolvedValue({} as never)
  })

  it('Enter on the username input triggers updateMyIdentity', async () => {
    render(<IdentityForm {...baseProps} />)
    const input = screen.getByLabelText('Username') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'newusername' } })
    void expectInputEnterSubmits({ input, onSubmit: mockUpdateMyIdentity })
    await waitFor(() => {
      expect(mockUpdateMyIdentity).toHaveBeenCalledWith({ username: 'newusername' })
    })
  })
})
