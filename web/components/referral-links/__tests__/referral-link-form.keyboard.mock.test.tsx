import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import { ReferralLinkForm } from '../referral-link-form'
import { createReferralLink } from '@/lib/api/client/referral-links'

vi.mock(import('next/navigation'), () => ({
  useRouter: vi.fn<VitestLooseMock>(() => ({ refresh: vi.fn<VitestLooseMock>() })),
}))

vi.mock(import('@/lib/api/client/referral-links'), () => ({
  createReferralLink: vi.fn<VitestLooseMock>(),
  updateReferralLink: vi.fn<VitestLooseMock>(),
  deleteReferralLink: vi.fn<VitestLooseMock>(),
}))

const mockCreateReferralLink = vi.mocked(createReferralLink)

describe('ReferralLinkForm — keyboard submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits via Enter on the URL input through the API client', async () => {
    mockCreateReferralLink.mockResolvedValue(undefined)

    render(<ReferralLinkForm referralProgramId='program-1' />)

    const urlInput = screen.getByLabelText('Referral URL') as HTMLInputElement
    fireEvent.change(urlInput, { target: { value: 'https://example.com/ref?code=123' } })

    void expectInputEnterSubmits({ input: urlInput, onSubmit: mockCreateReferralLink })

    await waitFor(() => {
      expect(mockCreateReferralLink).toHaveBeenCalledWith({
        referral_program_id: 'program-1',
        url: 'https://example.com/ref?code=123',
        label: null,
      })
    })
  })
})
