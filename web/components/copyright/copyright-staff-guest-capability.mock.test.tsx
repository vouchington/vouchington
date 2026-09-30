import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  issueCopyrightGuestCapability,
  listCopyrightGuestCapabilities,
  requestCopyrightGuestInformation,
  revokeCopyrightGuestCapability,
  type CopyrightGuestCapabilitiesPage,
  type CopyrightGuestCapabilitySummary,
} from '@/lib/api/client/copyright-guest'
import onError, { onSuccess } from '@/lib/on-error'

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<typeof onError>(),
  onSuccess: vi.fn<typeof onSuccess>(),
}))

vi.mock(import('@/lib/api/client/copyright-guest'), () => ({
  issueCopyrightGuestCapability: vi.fn<typeof issueCopyrightGuestCapability>(),
  listCopyrightGuestCapabilities: vi.fn<typeof listCopyrightGuestCapabilities>(),
  requestCopyrightGuestInformation: vi.fn<typeof requestCopyrightGuestInformation>(),
  revokeCopyrightGuestCapability: vi.fn<typeof revokeCopyrightGuestCapability>(),
}))

import { CopyrightStaffGuestCapability } from './copyright-staff-guest-capability'
import { toDateTimeLocalValue } from './copyright-staff-guest-capability-list'

const mockIssue = vi.mocked(issueCopyrightGuestCapability)
const mockList = vi.mocked(listCopyrightGuestCapabilities)
const mockRequest = vi.mocked(requestCopyrightGuestInformation)
const mockRevoke = vi.mocked(revokeCopyrightGuestCapability)
const noticeId = '00000000-0000-7000-8000-000000000830'
const capabilityId = '00000000-0000-7000-8000-000000000831'
const now = new Date('2026-09-01T12:00:00.000Z')

function capability(
  overrides: Partial<CopyrightGuestCapabilitySummary> = {},
): CopyrightGuestCapabilitySummary {
  return {
    id: capabilityId,
    issued_at: '2026-08-30T12:00:00.000Z',
    issued_by_id: '00000000-0000-7000-8000-000000000834',
    issued_by_username: 'copyright-staff',
    expires_at: '2026-09-08T12:00:00.000Z',
    revoked_at: null,
    ...overrides,
  }
}

function page(
  rows: CopyrightGuestCapabilitySummary[],
  hasNextPage = false,
): CopyrightGuestCapabilitiesPage {
  return {
    copyright_guest_capabilities: rows,
    page_info: { has_next_page: hasNextPage, start_cursor: null, end_cursor: 'cursor-1' },
  }
}

async function issueAccess() {
  fireEvent.change(screen.getByLabelText('Access expires'), {
    target: { value: '2026-09-05T12:00' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Issue guest access' }))
  await waitFor(() => {
    expect(screen.getByLabelText('Access token')).toHaveValue('shown-once-token')
  })
}

describe('CopyrightStaffGuestCapability', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
    vi.resetAllMocks()
    mockList.mockResolvedValue(page([]))
    mockIssue.mockResolvedValue({
      copyright_guest_capability: {
        id: capabilityId,
        expires_at: '2026-09-05T12:00:00.000Z',
        token: 'shown-once-token',
      },
    })
    mockRequest.mockResolvedValue({
      copyright_correspondence: { id: '00000000-0000-7000-8000-000000000832' },
    })
    mockRevoke.mockResolvedValue({
      copyright_guest_capability: { id: capabilityId, revoked_at: now.toISOString() },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists issued access with its issuer and offers actions only on live tokens', async () => {
    mockList.mockResolvedValue(
      page([
        capability(),
        capability({ id: 'revoked', revoked_at: '2026-08-31T12:00:00.000Z' }),
        capability({
          id: 'expired',
          issued_by_id: null,
          issued_by_username: null,
          expires_at: '2026-08-31T12:00:00.000Z',
        }),
      ]),
    )
    render(<CopyrightStaffGuestCapability noticeId={noticeId} />)
    const rows = within(await screen.findByRole('list', { name: 'Issued guest access' }))
      .getAllByRole('listitem')
      .map(row => within(row))
    expect(rows[0]?.getByText(/by @copyright-staff · expires/)).toBeInTheDocument()
    expect(rows[0]?.getByRole('button', { name: 'Revoke' })).toBeEnabled()
    expect(rows[1]?.getByText(/· revoked/)).toBeInTheDocument()
    expect(rows[2]?.getByText(/by a deleted account · expired/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(1)
    const lifetimeMs = 30 * 24 * 60 * 60 * 1000
    const expiryInput = screen.getByLabelText('Access expires')
    expect(expiryInput).toHaveAttribute('max', toDateTimeLocalValue(now.getTime() + lifetimeMs))
    const later = now.getTime() + 60 * 60 * 1000
    vi.setSystemTime(later)
    fireEvent.focus(expiryInput)
    expect(expiryInput).toHaveAttribute('max', toDateTimeLocalValue(later + lifetimeMs))
    expect(mockList).toHaveBeenCalledWith(noticeId)
  })

  it('does nothing until an expiry is entered', async () => {
    render(<CopyrightStaffGuestCapability noticeId={noticeId} />)
    await screen.findByText('No guest access issued.')
    fireEvent.click(screen.getByRole('button', { name: 'Issue guest access' }))
    expect(mockIssue).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Information request')).not.toBeInTheDocument()
  })

  it('shows a new token once, requests information, and revokes it', async () => {
    render(<CopyrightStaffGuestCapability noticeId={noticeId} />)
    await screen.findByText('No guest access issued.')
    mockList.mockResolvedValue(page([capability()]))
    await issueAccess()
    expect(mockIssue).toHaveBeenCalledWith(noticeId, new Date('2026-09-05T12:00').toISOString())
    expect(onSuccess).toHaveBeenCalledWith(
      'Guest access issued. Copy the token now. It is shown once.',
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Request information' }))
    fireEvent.change(screen.getByLabelText('Information request'), {
      target: { value: '  Send the original URL.  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send information request' }))
    await waitFor(() => {
      expect(screen.queryByLabelText('Information request')).not.toBeInTheDocument()
    })
    expect(mockRequest).toHaveBeenCalledWith(noticeId, capabilityId, 'Send the original URL.')

    mockList.mockResolvedValue(page([capability({ revoked_at: now.toISOString() })]))
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument()
    })
    expect(mockRevoke).toHaveBeenCalledWith(noticeId, capabilityId)
    expect(screen.queryByLabelText('Access token')).not.toBeInTheDocument()
    expect(onSuccess).toHaveBeenCalledWith('Guest access revoked.')
    expect(mockList).toHaveBeenCalledTimes(3)
  })

  it('reports load, issue, request, and revoke failures', async () => {
    mockList.mockRejectedValueOnce(new Error('list failed'))
    render(<CopyrightStaffGuestCapability noticeId={noticeId} />)
    await screen.findByText('Could not load guest access.')
    mockList.mockResolvedValue(page([capability()]))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByRole('list', { name: 'Issued guest access' })

    mockIssue.mockRejectedValueOnce(new Error('issue failed'))
    fireEvent.change(screen.getByLabelText('Access expires'), {
      target: { value: '2026-09-05T12:00' },
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
    await issueAccess()

    mockRequest.mockRejectedValueOnce(new Error('request failed'))
    fireEvent.click(screen.getByRole('button', { name: 'Request information' }))
    fireEvent.change(screen.getByLabelText('Information request'), {
      target: { value: 'Need the URL.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send information request' }))
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
    expect(screen.getByLabelText('Information request')).toHaveValue('Need the URL.')
  })

  it('loads older guest access from the next cursor', async () => {
    mockList.mockResolvedValueOnce(page([capability()], true))
    render(<CopyrightStaffGuestCapability noticeId={noticeId} />)
    mockList.mockRejectedValueOnce(new Error('older failed'))
    fireEvent.click(await screen.findByRole('button', { name: 'Load older guest access' }))
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.any(Error), {
        fallback: 'Could not load older guest access',
      })
    })
    mockList.mockResolvedValueOnce(page([capability({ id: 'older', issued_by_username: 'mod' })]))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Load older guest access' })).toBeEnabled()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Load older guest access' }))
    await screen.findByText(/by @mod · expires/)
    expect(mockList).toHaveBeenLastCalledWith(noticeId, { after: 'cursor-1' })
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(
      screen.queryByRole('button', { name: 'Load older guest access' }),
    ).not.toBeInTheDocument()
  })

  it('does not request older access without a cursor', async () => {
    mockList.mockResolvedValue({
      ...page([capability()], true),
      page_info: { has_next_page: true, start_cursor: null, end_cursor: null },
    })
    render(<CopyrightStaffGuestCapability noticeId={noticeId} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Load older guest access' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Load older guest access' })).toBeEnabled()
    })
    expect(mockList).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })
})
