import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { makeCopyrightEuParticipantNotice } from '@/test-helpers/api-responses/copyright-eu'
import {
  getCopyrightNoticeServer,
  getCopyrightParticipantNoticeServer,
} from '@/lib/api/server/copyright-notices'
import { requireCurrentUser } from '@/lib/auth/require-current-user'

const { notFound } = vi.hoisted(() => ({ notFound: vi.fn<() => never>() }))
vi.mock(import('next/navigation'), () => ({ ...navMockModule, notFound }))
vi.mock(import('@/lib/auth/require-current-user'), () => ({
  requireCurrentUser: vi.fn<typeof requireCurrentUser>(),
}))
vi.mock(import('@/lib/api/server/copyright-notices'), () => ({
  getCopyrightNoticeServer: vi.fn<typeof getCopyrightNoticeServer>(),
  getCopyrightParticipantNoticeServer: vi.fn<typeof getCopyrightParticipantNoticeServer>(),
}))
import CopyrightNoticePage from './page'

const nav = createNavMock()
const params = { params: Promise.resolve({ id: '019f0000-0000-7000-8000-000000000001' }) }
describe('CopyrightNoticePage EU participant projection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    nav.reset()
    notFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })
  })
  it('renders an unaccepted no-action case without requiring public detail', async () => {
    vi.mocked(getCopyrightParticipantNoticeServer).mockResolvedValue(
      makeCopyrightEuParticipantNotice(),
    )
    render(await CopyrightNoticePage(params))
    expect(screen.getByRole('heading', { name: 'EU copyright notice' })).toBeInTheDocument()
    expect(screen.getByText('No action was taken.')).toBeInTheDocument()
    expect(getCopyrightNoticeServer).not.toHaveBeenCalled()
    expect(notFound).not.toHaveBeenCalled()
  })
})
