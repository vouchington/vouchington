import { configure, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { decideCopyrightTerritorialNotice } from '@/lib/api/client/copyright-territorial-decisions'
import {
  resolveCopyrightNoticeTargets,
  type CopyrightNoticeResolvedTarget,
} from '@/lib/api/client/copyright-notice-targets'
import { makeCopyrightStaffQueueItem } from '@/test-helpers/api-responses/copyright'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import { CopyrightStaffTerritorialDecision } from './copyright-staff-territorial-decision'
import type { SubmitReview } from './copyright-staff-review-buttons'

configure({ testIdAttribute: 'data-pw' })

vi.mock(import('@/lib/api/client/copyright-territorial-decisions'), () => ({
  decideCopyrightTerritorialNotice: vi.fn<VitestLooseMock>(),
  recordCopyrightTerritorialAcknowledgmentFailure: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/api/client/copyright-notice-targets'), async importOriginal => ({
  ...(await importOriginal()),
  resolveCopyrightNoticeTargets: vi.fn<typeof resolveCopyrightNoticeTargets>(),
}))

const mockDecision = vi.mocked(decideCopyrightTerritorialNotice)
const mockResolve = vi.mocked(resolveCopyrightNoticeTargets)
const post: CopyrightNoticeResolvedTarget = {
  surface: 'post-image',
  post_id: 'post-1',
  image_id: 'image-1',
  target_url: 'https://voucha.ai/discussion/post-1',
  order_index: 0,
  caption: 'Photograph',
}
const profile: CopyrightNoticeResolvedTarget = {
  surface: 'user-profile-image',
  user_id: 'user-1',
  image_id: 'image-2',
  target_url: 'https://voucha.ai/users/user-1',
  order_index: 1,
  caption: 'Avatar',
}

function item(overrides: Partial<CopyrightStaffQueueItem> = {}): CopyrightStaffQueueItem {
  return makeCopyrightStaffQueueItem({
    jurisdiction: 'eu_dsa',
    reasons: ['territorial_notice_review'],
    territorial: {
      hosted_use_url: post.target_url,
      grounds: 'The photograph is reproduced.',
      notifier: { name: 'Notifier', email: 'notifier@example.test' },
      recipients: [],
      complaints: [],
      complaints_page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      dispute_settlements: [],
      dispute_settlements_page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
      acknowledgment: {
        attempt_count: 0,
        last_attempt_at: null,
        acknowledged_at: null,
        exhausted_at: null,
        escalated: false,
      },
      reopened_at: null,
      decision: null,
    },
    ...overrides,
  })
}

function fillText() {
  fireEvent.change(screen.getByLabelText('Internal rationale'), {
    target: { value: 'Reviewed work and URL.' },
  })
  fireEvent.change(screen.getByLabelText('Explanation for the poster and the notifier'), {
    target: { value: 'This photograph matches the notified work.' },
  })
}

describe('territorial staff decision', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires both explanations and omits targets for No action', async () => {
    const onReview = vi.fn<SubmitReview>()
    render(
      <CopyrightStaffTerritorialDecision
        item={item()}
        pending={false}
        onReview={onReview}
      />,
    )
    const button = screen.getByRole('button', { name: 'Record decision' })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Internal rationale'), { target: { value: 'Review' } })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Explanation for the poster and the notifier'), {
      target: { value: 'No restriction is warranted.' },
    })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    await onReview.mock.calls[0]![0]()
    expect(mockDecision).toHaveBeenCalledWith('eu_dsa', 'case-test', {
      text: 'Review',
      publicExplanation: 'No restriction is warranted.',
      outcome: 'no_action',
    })
  })

  it('requires a post-image selection and sends the closed EU restrict target', async () => {
    mockResolve.mockResolvedValue([profile, post])
    const onReview = vi.fn<SubmitReview>()
    render(
      <CopyrightStaffTerritorialDecision
        item={item()}
        pending={false}
        onReview={onReview}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Restrict' }))
    fillText()
    expect(screen.getByLabelText('Hosted use URL')).toHaveValue(post.target_url)
    expect(screen.getByRole('button', { name: 'Record decision' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Find hosted material' }))
    expect(await screen.findByLabelText('Hosted image 1: Photograph')).toBeInTheDocument()
    expect(screen.queryByText('Avatar')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Hosted image 1: Photograph'))
    fireEvent.click(screen.getByRole('button', { name: 'Record decision' }))
    await onReview.mock.calls[0]![0]()
    expect(mockDecision).toHaveBeenCalledWith('eu_dsa', 'case-test', {
      text: 'Reviewed work and URL.',
      publicExplanation: 'This photograph matches the notified work.',
      outcome: 'restrict',
      targets: [
        {
          surface: 'post-image',
          post_id: 'post-1',
          image_id: 'image-1',
          target_url: post.target_url,
        },
      ],
    })
  })

  it('offers only Restrict after a complaint reopens the notice and posts to UK reviews', async () => {
    const onReview = vi.fn<SubmitReview>()
    const uk = item({
      jurisdiction: 'uk',
      territorial: { ...item().territorial!, reopened_at: '2026-10-04T00:00:00Z' },
    })
    render(
      <CopyrightStaffTerritorialDecision
        item={uk}
        pending={false}
        onReview={onReview}
      />,
    )
    expect(screen.getByText(/complaint was upheld/i)).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'No action' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Restrict' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Record decision' })).toBeDisabled()
  })

  it('keeps text after an attempted action and disables submission while pending', () => {
    const onReview = vi.fn<SubmitReview>()
    const { rerender } = render(
      <CopyrightStaffTerritorialDecision
        item={item()}
        pending={false}
        onReview={onReview}
      />,
    )
    fillText()
    fireEvent.click(screen.getByRole('button', { name: 'Record decision' }))
    expect(onReview).toHaveBeenCalledOnce()
    rerender(
      <CopyrightStaffTerritorialDecision
        item={item()}
        pending
        onReview={onReview}
      />,
    )
    expect(screen.getByLabelText('Internal rationale')).toHaveValue('Reviewed work and URL.')
    expect(screen.getByLabelText('Explanation for the poster and the notifier')).toHaveValue(
      'This photograph matches the notified work.',
    )
    expect(screen.getByRole('button', { name: 'Record decision' })).toBeDisabled()
  })
})
