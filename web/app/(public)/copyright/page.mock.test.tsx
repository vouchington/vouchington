import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notFound } from 'next/navigation'

vi.mock(import('next/navigation'), async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    notFound: vi.fn<typeof notFound>(() => {
      throw new Error('NEXT_HTTP_ERROR_FALLBACK;404')
    }),
  }
})

vi.mock(import('@/lib/auth/require-current-user'), () => ({
  requireCurrentUser: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server/copyright-notices'), () => ({
  getCopyrightNotices: vi.fn<VitestLooseMock>(),
  getCopyrightNoticeServer: vi.fn<VitestLooseMock>(),
  getCopyrightParticipantNoticeServer: vi.fn<VitestLooseMock>(),
  getCopyrightReviewQueue: vi.fn<VitestLooseMock>(),
  getCopyrightEmailIntakeReviewQueue: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/copyright/copyright-notice-form'), () => ({
  CopyrightNoticeForm: () => <div>notice form</div>,
}))
vi.mock(import('@/components/copyright/copyright-appeal-form'), () => ({
  CopyrightAppealForm: () => <div>appeal form</div>,
}))
vi.mock(import('@/components/copyright/copyright-response-forms'), () => ({
  CopyrightCounterNoticeForm: () => <div>counter-notice form</div>,
}))
vi.mock(import('@/components/copyright/copyright-notice-detail'), () => ({
  CopyrightNoticeDetailView: () => <div>notice detail</div>,
}))
vi.mock(import('@/components/copyright/copyright-staff-queue'), () => ({
  CopyrightStaffQueue: () => <div>staff queue</div>,
}))
vi.mock(import('@/components/copyright/copyright-email-review'), () => ({
  CopyrightEmailReview: ({ data }) => (
    <div>email review {data.copyright_email_intakes.map(intake => intake.id).join(',')}</div>
  ),
}))

import { requireCurrentUser } from '@/lib/auth/require-current-user'
import {
  getCopyrightEmailIntakeReviewQueue,
  getCopyrightNoticeServer,
  getCopyrightNotices,
  getCopyrightParticipantNoticeServer,
  getCopyrightReviewQueue,
} from '@/lib/api/server/copyright-notices'
import {
  copyrightEmailIntakeId,
  makeCopyrightEmailQueuePage,
} from '@/test-helpers/components/copyright/copyright-email-review'
import CopyrightPage from './page'
import CounterNoticePage from './counter-notice/page'
import DesignatedAgentPage from './designated-agent/page'
import RepeatInfringerPolicyPage from './repeat-infringer-policy/page'
import CopyrightNoticesLayout from './notices/layout'
import CopyrightNoticesPage from './notices/page'
import NewCopyrightNoticePage from './notices/new/page'
import CopyrightNoticePage from './notices/[id]/page'
import CopyrightAppealPage from './notices/[id]/appeal/page'
import CopyrightCounterNoticePage from './notices/[id]/counter-notice/page'
import CopyrightReviewQueuePage from './review-queue/page'
import CopyrightEmailReviewPage from './email-review/page'

const mockUser = vi.mocked(requireCurrentUser)
const mockList = vi.mocked(getCopyrightNotices)
const mockNotice = vi.mocked(getCopyrightNoticeServer)
const mockParticipant = vi.mocked(getCopyrightParticipantNoticeServer)
const mockReviewQueue = vi.mocked(getCopyrightReviewQueue)
const mockEmailQueue = vi.mocked(getCopyrightEmailIntakeReviewQueue)

describe('copyright pages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUser.mockResolvedValue({ roles: ['moderator'] } as never)
  })

  it('renders the public policy pages', () => {
    render(<CopyrightPage />)
    expect(screen.getByRole('heading', { name: 'Copyright policy' })).toBeInTheDocument()
    render(<CounterNoticePage />)
    expect(
      screen.getByRole('heading', { name: 'Counter-notice and restoration' }),
    ).toBeInTheDocument()
    render(<DesignatedAgentPage />)
    expect(screen.getByRole('heading', { name: 'Designated agent status' })).toBeInTheDocument()
    render(<RepeatInfringerPolicyPage />)
    expect(screen.getByRole('heading', { name: 'Repeat-infringer policy' })).toBeInTheDocument()
    render(<CopyrightNoticesLayout>layout child</CopyrightNoticesLayout>)
    expect(screen.getByText('layout child')).toBeInTheDocument()
  })

  it('loads signed-in notice list, create, and staff queues', async () => {
    mockList.mockResolvedValue({
      copyright_notices: [
        {
          id: 'notice-1',
          jurisdiction: 'us_dmca',
          received_at: '2026-07-01T00:00:00.000Z',
          accepted_at: '2026-07-01T00:00:00.000Z',
          provisional_withholding_at: null,
          target_count: 1,
        },
      ],
      page_info: { has_next_page: true, start_cursor: 'a', end_cursor: 'b' },
    })
    mockReviewQueue.mockResolvedValue({
      copyright_notices: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })
    mockEmailQueue.mockResolvedValue(makeCopyrightEmailQueuePage())
    render(await CopyrightNoticesPage({ searchParams: Promise.resolve({ after: 'cursor' }) }))
    expect(screen.getByText('Case notice-1')).toBeInTheDocument()
    expect(screen.getByText('Load more accepted copyright notices')).toBeInTheDocument()
    render(await NewCopyrightNoticePage())
    expect(screen.getByText('notice form')).toBeInTheDocument()
    render(await CopyrightReviewQueuePage())
    expect(screen.getByText('staff queue')).toBeInTheDocument()
    render(await CopyrightEmailReviewPage())
    expect(screen.getByText(`email review ${copyrightEmailIntakeId}`)).toBeInTheDocument()
  })

  it('loads a public notice and poster response routes', async () => {
    mockNotice.mockResolvedValue({ id: 'notice-1' } as never)
    mockParticipant.mockResolvedValue({
      viewer_role: 'poster',
      respondable_target_ids: ['target-1'],
    } as never)
    render(await CopyrightNoticePage({ params: Promise.resolve({ id: 'notice-1' }) }))
    expect(screen.getByText('notice detail')).toBeInTheDocument()
    render(await CopyrightAppealPage({ params: Promise.resolve({ id: 'notice-1' }) }))
    expect(screen.getByText('appeal form')).toBeInTheDocument()
    render(await CopyrightCounterNoticePage({ params: Promise.resolve({ id: 'notice-1' }) }))
    expect(screen.getByText('counter-notice form')).toBeInTheDocument()
  })

  it('returns notFound when the viewer cannot use staff or poster routes', async () => {
    mockUser.mockResolvedValue({ roles: ['user'] } as never)
    mockNotice.mockResolvedValue(null)
    mockParticipant.mockResolvedValue(null)
    await expect(CopyrightReviewQueuePage()).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
    await expect(CopyrightEmailReviewPage()).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
    await expect(
      CopyrightNoticePage({ params: Promise.resolve({ id: 'missing' }) }),
    ).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
    await expect(
      CopyrightAppealPage({ params: Promise.resolve({ id: 'missing' }) }),
    ).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
  })
})
