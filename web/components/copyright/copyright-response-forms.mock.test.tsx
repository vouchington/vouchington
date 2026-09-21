import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCopyrightAppeal,
  createCopyrightCounterNotice,
} from '@/lib/api/client/copyright-notices'
import { CopyrightAppealForm } from './copyright-appeal-form'
import { CopyrightCounterNoticeForm } from './copyright-response-forms'

vi.mock(import('@/hooks/use-turnstile-token'), () => ({
  useTurnstileToken: () => ({
    token: 'turnstile-token',
    reset: vi.fn<() => void>(),
    containerRef: vi.fn<(node: HTMLDivElement | null) => void>(),
    isError: false,
    alwaysApprove: true,
  }),
}))

vi.mock(import('@/components/shared/turnstile-field'), () => ({
  TurnstileField: () => null,
}))

vi.mock(import('@/lib/api/client/copyright-notices'), () => ({
  createCopyrightAppeal: vi.fn<typeof createCopyrightAppeal>(),
  createCopyrightCounterNotice: vi.fn<typeof createCopyrightCounterNotice>(),
}))

const mockCreateAppeal = vi.mocked(createCopyrightAppeal)
const mockCreateCounterNotice = vi.mocked(createCopyrightCounterNotice)
const noticeId = '019f0000-0000-7000-8000-000000000001'
const targetIds = ['019f0000-0000-7000-8000-000000000002', '019f0000-0000-7000-8000-000000000003']

describe('copyright response forms', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateAppeal.mockResolvedValue({
      copyright_submission: { id: '019f0000-0000-7000-8000-000000000004' },
      is_duplicate: false,
    })
    mockCreateCounterNotice.mockResolvedValue({
      copyright_submission: { id: '019f0000-0000-7000-8000-000000000005' },
      is_duplicate: false,
    })
  })

  it('submits an appeal only for the selected respondable targets', async () => {
    render(
      <CopyrightAppealForm
        noticeId={noticeId}
        targetIds={targetIds}
      />,
    )
    fireEvent.change(screen.getByLabelText('Why should this action be changed?'), {
      target: { value: 'This material is mine.' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Affected material 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit appeal' }))

    await waitFor(() => {
      expect(mockCreateAppeal).toHaveBeenCalledWith(noticeId, {
        reason: 'This material is mine.',
        target_ids: [targetIds[0]],
        cf_turnstile_response: 'turnstile-token',
      })
    })
  })

  it('keeps the appeal form usable after a submission failure', async () => {
    mockCreateAppeal.mockRejectedValueOnce(new Error('network'))
    render(
      <CopyrightAppealForm
        noticeId={noticeId}
        targetIds={targetIds}
      />,
    )
    fireEvent.change(screen.getByLabelText('Why should this action be changed?'), {
      target: { value: 'This material is mine.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit appeal' }))
    await waitFor(() => expect(mockCreateAppeal).toHaveBeenCalled())
  })

  it('discloses counter-notice forwarding and submits only selected targets', async () => {
    render(
      <CopyrightCounterNoticeForm
        noticeId={noticeId}
        targetIds={targetIds}
      />,
    )
    expect(
      screen.getByText(/forward your name, address, telephone number, electronic signature/i),
    ).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Full legal name'), { target: { value: 'Poster' } })
    fireEvent.change(screen.getByLabelText('Mailing address'), { target: { value: '1 Main St' } })
    fireEvent.change(screen.getByLabelText('Telephone'), { target: { value: '555-0100' } })
    fireEvent.change(screen.getByLabelText('Electronic signature'), { target: { value: 'Poster' } })
    fireEvent.click(screen.getByLabelText(/good-faith belief the material was removed/i))
    fireEvent.click(screen.getByLabelText(/consent to the jurisdiction/i))
    fireEvent.click(screen.getByLabelText(/accept service of process/i))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Affected material 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit counter-notice' }))

    await waitFor(() => {
      expect(mockCreateCounterNotice).toHaveBeenCalledWith(noticeId, {
        name: 'Poster',
        address: '1 Main St',
        telephone: '555-0100',
        electronic_signature: 'Poster',
        good_faith_misidentification_under_penalty_of_perjury: true,
        consent_to_federal_jurisdiction: true,
        consent_to_service_of_process: true,
        target_ids: [targetIds[0]],
        cf_turnstile_response: 'turnstile-token',
      })
    })
  })

  it('keeps the form usable after a counter-notice submission failure', async () => {
    mockCreateCounterNotice.mockRejectedValueOnce(new Error('network'))
    render(
      <CopyrightCounterNoticeForm
        noticeId={noticeId}
        targetIds={targetIds}
      />,
    )
    fireEvent.change(screen.getByLabelText('Full legal name'), { target: { value: 'Poster' } })
    fireEvent.change(screen.getByLabelText('Mailing address'), { target: { value: '1 Main St' } })
    fireEvent.change(screen.getByLabelText('Telephone'), { target: { value: '555-0100' } })
    fireEvent.change(screen.getByLabelText('Electronic signature'), { target: { value: 'Poster' } })
    fireEvent.click(screen.getByLabelText(/good-faith belief the material was removed/i))
    fireEvent.click(screen.getByLabelText(/consent to the jurisdiction/i))
    fireEvent.click(screen.getByLabelText(/accept service of process/i))
    fireEvent.click(screen.getByRole('button', { name: 'Submit counter-notice' }))
    await waitFor(() => expect(mockCreateCounterNotice).toHaveBeenCalled())
  })
})
