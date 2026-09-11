import { describe, expect, it, vi } from 'vitest'
import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'

// The component uses data-pw (not data-testid) per project conventions.
configure({ testIdAttribute: 'data-pw' })
import { OfficialReferralLinkForm } from '../official-referral-link-form'

vi.mock(import('next/navigation'), () => ({
  useRouter: vi.fn<VitestLooseMock>(() => ({
    refresh: vi.fn<VitestLooseMock>(),
  })),
}))

vi.mock(import('@/lib/api/client/official-referral-links'), () => ({
  createOfficialReferralLink: vi.fn<VitestLooseMock>(),
  deleteOfficialReferralLink: vi.fn<VitestLooseMock>(),
}))

import {
  createOfficialReferralLink,
  deleteOfficialReferralLink,
} from '@/lib/api/client/official-referral-links'

const mockCreate = vi.mocked(createOfficialReferralLink)
const mockDelete = vi.mocked(deleteOfficialReferralLink)

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
}))

describe('OfficialReferralLinkForm', () => {
  it('renders form inputs and empty table', () => {
    render(
      <OfficialReferralLinkForm
        referralProgramId='prog-1'
        links={[]}
      />,
    )
    expect(screen.getByTestId('official-referral-link-form')).toBeInTheDocument()
    expect(screen.getByTestId('official-referral-link-url-input')).toBeInTheDocument()
    expect(screen.getByTestId('official-referral-link-label-input')).toBeInTheDocument()
    expect(screen.getByTestId('official-referral-link-submit')).toBeInTheDocument()
    expect(screen.getByTestId('official-referral-links-table')).toBeInTheDocument()
  })

  it('renders delete buttons for each existing link', () => {
    const links = [
      { id: 'link-1', url: 'https://example.com/ref/1', label: 'Link 1', activated_at: null },
      { id: 'link-2', url: 'https://example.com/ref/2', label: null, activated_at: null },
    ]
    render(
      <OfficialReferralLinkForm
        referralProgramId='prog-1'
        links={links}
      />,
    )
    expect(screen.getAllByTestId('official-referral-link-delete')).toHaveLength(2)
  })

  it('submit handler calls createOfficialReferralLink and refreshes', async () => {
    mockCreate.mockResolvedValue({ official_referral_link: { id: 'new-link' } })

    render(
      <OfficialReferralLinkForm
        referralProgramId='prog-1'
        links={[]}
      />,
    )

    const urlInput = screen.getByTestId('official-referral-link-url-input')
    fireEvent.change(urlInput, { target: { value: 'https://example.com/ref/new' } })

    const form = screen.getByTestId('official-referral-link-form')
    fireEvent.submit(form)

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith('prog-1', {
        url: 'https://example.com/ref/new',
        label: null,
      })
    })
  })

  it('delete handler calls deleteOfficialReferralLink', async () => {
    mockDelete.mockResolvedValue(undefined)

    const links = [
      { id: 'link-1', url: 'https://example.com/ref/1', label: 'Link 1', activated_at: null },
    ]
    render(
      <OfficialReferralLinkForm
        referralProgramId='prog-1'
        links={links}
      />,
    )

    const deleteBtn = screen.getByTestId('official-referral-link-delete')
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('link-1')
    })
  })
})
