import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { makeCopyrightEuParticipantNotice } from '@/test-helpers/api-responses/copyright-eu'
import { getCopyrightParticipantNoticeServer } from '@/lib/api/server/copyright-notices'
import { requireCurrentUser } from '@/lib/auth/require-current-user'

const { notFound } = vi.hoisted(() => ({ notFound: vi.fn<() => never>() }))
vi.mock(import('next/navigation'), () => ({ ...navMockModule, notFound }))
vi.mock(import('@/lib/auth/require-current-user'), () => ({
  requireCurrentUser: vi.fn<typeof requireCurrentUser>(),
}))
vi.mock(import('@/lib/api/server/copyright-notices'), () => ({
  getCopyrightParticipantNoticeServer: vi.fn<typeof getCopyrightParticipantNoticeServer>(),
}))
vi.mock(import('@/components/copyright/copyright-eu-complaint-form'), () => ({
  CopyrightEuComplaintForm: ({ noticeId }: { noticeId: string }) => (
    <div>Complaint for {noticeId}</div>
  ),
}))
import CopyrightComplaintPage from './page'

const nav = createNavMock()
const params = { params: Promise.resolve({ id: '019f0000-0000-7000-8000-000000000001' }) }
describe('CopyrightComplaintPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    nav.reset()
    notFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })
  })
  it('renders for an eligible participant using the existing case without an availability read', async () => {
    vi.mocked(getCopyrightParticipantNoticeServer).mockResolvedValue(
      makeCopyrightEuParticipantNotice(),
    )
    render(await CopyrightComplaintPage(params))
    expect(
      screen.getByRole('heading', { name: 'Copyright decision complaint' }),
    ).toBeInTheDocument()
    expect(requireCurrentUser).toHaveBeenCalled()
    expect(notFound).not.toHaveBeenCalled()
  })
  it.each([false, true])('refuses a missing or ineligible case (missing: %s)', async missing => {
    vi.mocked(getCopyrightParticipantNoticeServer).mockResolvedValue(
      missing ? null : makeCopyrightEuParticipantNotice({ canSubmit: false }),
    )
    await expect(CopyrightComplaintPage(params)).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
