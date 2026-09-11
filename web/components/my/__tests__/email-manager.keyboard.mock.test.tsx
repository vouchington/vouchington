import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import { EmailManager } from '../email-manager'

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
  deleteMyEmailAddress: vi.fn<VitestLooseMock>(),
  requestMyEmailAddressVerification: vi.fn<VitestLooseMock>(),
  setPrimaryMyEmailAddress: vi.fn<VitestLooseMock>(),
  verifyMyEmailAddress: vi.fn<VitestLooseMock>(),
}))

import { requestMyEmailAddressVerification } from '@/lib/api/client'

const mockRequestVerification = vi.mocked(requestMyEmailAddressVerification)

describe('EmailManager keyboard submit (add-email create form)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockRequestVerification.mockResolvedValue({ email_address: 'tests+new@voucha.ai' })
  })

  it('Enter on the new email input triggers requestMyEmailAddressVerification', async () => {
    render(<EmailManager initialEmailAddresses={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /add email address/i }))
    const input = screen.getByLabelText('New email address') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'tests+new@voucha.ai' } })
    void expectInputEnterSubmits({ input, onSubmit: mockRequestVerification })
    await waitFor(() => {
      expect(mockRequestVerification).toHaveBeenCalledWith('tests+new@voucha.ai')
    })
  })
})
