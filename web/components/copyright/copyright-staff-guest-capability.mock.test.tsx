import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  issueCopyrightGuestCapability,
  requestCopyrightGuestInformation,
  revokeCopyrightGuestCapability,
} from '@/lib/api/client/copyright-guest'
import onError, { onSuccess } from '@/lib/on-error'

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<typeof onError>(),
  onSuccess: vi.fn<typeof onSuccess>(),
}))

vi.mock(import('@/lib/api/client/copyright-guest'), () => ({
  issueCopyrightGuestCapability: vi.fn<typeof issueCopyrightGuestCapability>(),
  requestCopyrightGuestInformation: vi.fn<typeof requestCopyrightGuestInformation>(),
  revokeCopyrightGuestCapability: vi.fn<typeof revokeCopyrightGuestCapability>(),
}))

import { CopyrightStaffGuestCapability } from './copyright-staff-guest-capability'

const mockIssue = vi.mocked(issueCopyrightGuestCapability)
const mockRequest = vi.mocked(requestCopyrightGuestInformation)
const mockRevoke = vi.mocked(revokeCopyrightGuestCapability)
const noticeId = '00000000-0000-7000-8000-000000000830'
const capabilityId = '00000000-0000-7000-8000-000000000831'

function issuedCapability() {
  return {
    copyright_guest_capability: {
      id: capabilityId,
      expires_at: '2026-09-01T19:00:00.000Z',
      token: 'shown-once-token',
    },
  }
}

async function issueAccess() {
  fireEvent.change(screen.getByLabelText('Access expires'), {
    target: { value: '2026-09-01T12:00' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Issue guest access' }))
  await waitFor(() => {
    expect(screen.getByLabelText('Access token')).toHaveValue('shown-once-token')
  })
}

describe('CopyrightStaffGuestCapability', () => {
  beforeEach(() => {
    mockIssue.mockReset()
    mockRequest.mockReset()
    mockRevoke.mockReset()
    vi.mocked(onError).mockReset()
    vi.mocked(onSuccess).mockReset()
    mockIssue.mockResolvedValue(issuedCapability())
    mockRequest.mockResolvedValue({
      copyright_correspondence: { id: '00000000-0000-7000-8000-000000000832' },
    })
    mockRevoke.mockResolvedValue({
      copyright_guest_capability: { id: capabilityId, revoked_at: '2026-09-01T20:00:00.000Z' },
    })
  })

  it('does nothing until an expiry is entered', () => {
    render(<CopyrightStaffGuestCapability noticeId={noticeId} />)
    fireEvent.click(screen.getByRole('button', { name: 'Issue guest access' }))
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    fireEvent.click(screen.getByRole('button', { name: 'Request information' }))
    expect(mockIssue).not.toHaveBeenCalled()
    expect(mockRevoke).not.toHaveBeenCalled()
    expect(mockRequest).not.toHaveBeenCalled()
  })

  it('issues access, records an information request, and revokes the token', async () => {
    render(<CopyrightStaffGuestCapability noticeId={noticeId} />)
    await issueAccess()
    expect(mockIssue).toHaveBeenCalledWith(noticeId, new Date('2026-09-01T12:00').toISOString())
    expect(onSuccess).toHaveBeenCalledWith(
      'Guest access issued. Copy the token now. It is shown once.',
    )

    fireEvent.change(screen.getByLabelText('Information request'), {
      target: { value: '  Send the original URL.  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Request information' }))
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledWith(noticeId, capabilityId, 'Send the original URL.')
    })
    expect(screen.getByLabelText('Information request')).toHaveValue('')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Revoke' })).toBeEnabled()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    await waitFor(() => {
      expect(mockRevoke).toHaveBeenCalledWith(noticeId, capabilityId)
    })
    expect(screen.queryByLabelText('Access token')).not.toBeInTheDocument()
  })

  it('reports issue, request, and revoke failures', async () => {
    mockIssue.mockRejectedValueOnce(new Error('issue failed'))
    render(<CopyrightStaffGuestCapability noticeId={noticeId} />)
    fireEvent.change(screen.getByLabelText('Access expires'), {
      target: { value: '2026-09-01T12:00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Issue guest access' }))
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.any(Error), {
        fallback: 'Could not issue guest access',
      })
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Issue guest access' })).toBeEnabled()
    })

    mockIssue.mockResolvedValue(issuedCapability())
    fireEvent.click(screen.getByRole('button', { name: 'Issue guest access' }))
    await screen.findByLabelText('Access token')

    mockRequest.mockRejectedValueOnce(new Error('request failed'))
    fireEvent.change(screen.getByLabelText('Information request'), {
      target: { value: 'Need the URL.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Request information' }))
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.any(Error), {
        fallback: 'Could not request information',
      })
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Revoke' })).toBeEnabled()
    })

    mockRevoke.mockRejectedValueOnce(new Error('revoke failed'))
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.any(Error), {
        fallback: 'Could not revoke guest access',
      })
    })
    expect(screen.getByLabelText('Access token')).toHaveValue('shown-once-token')
  })
})
