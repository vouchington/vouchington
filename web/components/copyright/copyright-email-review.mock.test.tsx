import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  copyrightEmailIntakesClientMock as intakesClient,
  copyrightNoticeTargetsClientMock as targetsClient,
} from '@/test-helpers/components/copyright/copyright-email-client-mocks'
import {
  copyrightEmailIntakeId as intakeId,
  makeCopyrightEmailIntake as makeIntake,
  makeCopyrightEmailQueueItem as makeQueueItem,
  makeCopyrightEmailQueuePage as makeQueuePage,
  makeMatchedCopyrightEmailIntake as makeMatchedIntake,
  makeMatchedCopyrightEmailQueueItem as makeMatchedQueueItem,
} from '@/test-helpers/components/copyright/copyright-email-review'
import { CopyrightEmailReview } from './copyright-email-review'

configure({ testIdAttribute: 'data-pw' })

vi.mock(import('@/lib/api/client/copyright-email-intakes'), () => intakesClient)
vi.mock(import('@/lib/api/client/copyright-notice-targets'), () => targetsClient)

const mockApprove = intakesClient.approveCopyrightEmailIntake
const mockAdmitCorrespondence = intakesClient.admitCopyrightEmailCorrespondence
const mockGet = intakesClient.getCopyrightEmailIntake
const mockList = intakesClient.listCopyrightEmailIntakes
const mockReject = intakesClient.rejectCopyrightEmailIntake
const mockRejectCorrespondence = intakesClient.rejectCopyrightEmailCorrespondence
const mockResolveTargets = targetsClient.resolveCopyrightNoticeTargets
const otherIntakeId = '019f0000-0000-7000-8000-000000000007'

describe('CopyrightEmailReview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue(makeQueuePage())
    mockGet.mockResolvedValue({ copyright_email_intake: makeIntake() })
    mockResolveTargets.mockResolvedValue([
      {
        post_id: '019f0000-0000-7000-8000-000000000003',
        image_id: '019f0000-0000-7000-8000-000000000004',
        target_url: 'https://voucha.ai/discussion/example',
        order_index: 0,
        caption: 'Claimed image',
      },
    ])
  })

  it('shows private evidence, parsed content, and a recommendation-mapped approval form', async () => {
    render(<CopyrightEmailReview data={makeQueuePage()} />)

    await selectEmailIntake()

    const detail = screen
      .getByRole('heading', { name: 'Staff-private evidence' })
      .closest('section')
    expect(detail).not.toBeNull()
    expect(detail).toHaveTextContent('Raw email metadata')
    expect(screen.getByRole('link', { name: /Download original email/ })).toHaveAttribute(
      'href',
      `/api/v1/copyright-email-intakes/${intakeId}/raw`,
    )
    expect(detail).toHaveTextContent('tests+copyright-claimant@voucha.ai')
    expect(detail).toHaveTextContent('potentially_valid')
    expect(screen.getByLabelText('Claimant email')).toHaveValue(
      'tests+copyright-claimant@voucha.ai',
    )
  })

  it('submits the moderator-edited statutory payload when approving', async () => {
    mockApprove.mockResolvedValue(undefined)
    mockResolveTargets.mockResolvedValue([
      {
        post_id: '019f0000-0000-7000-8000-000000000003',
        image_id: '019f0000-0000-7000-8000-000000000004',
        target_url: 'https://voucha.ai/discussion/example',
        order_index: 0,
        caption: 'Claimed image',
      },
      {
        post_id: '019f0000-0000-7000-8000-000000000003',
        image_id: '019f0000-0000-7000-8000-000000000005',
        target_url: 'https://voucha.ai/discussion/example',
        order_index: 1,
        caption: 'Second image',
      },
    ])
    render(<CopyrightEmailReview data={makeQueuePage()} />)

    await selectEmailIntake()
    fireEvent.change(screen.getByLabelText('Claimant email'), {
      target: { value: 'tests+copyright-edited@voucha.ai' },
    })
    expect(screen.queryByLabelText('Post ID 1')).not.toBeInTheDocument()
    await selectHostedImage('Claimed image')
    fireEvent.click(screen.getByLabelText('Hosted image 2: Second image'))
    fireEvent.change(screen.getByLabelText('Review rationale'), {
      target: { value: 'Verified the parsed notice.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Approve structured intake' }))

    await waitFor(() => {
      expect(mockApprove).toHaveBeenCalledWith(intakeId, {
        jurisdiction: 'us_dmca',
        claimant_display_name: 'Claimant',
        claimant_contact: 'tests+copyright-claimant@voucha.ai',
        claimant_email: 'tests+copyright-edited@voucha.ai',
        work_description: 'Claimant photograph',
        good_faith_belief: true,
        accuracy_authority_under_penalty_of_perjury: true,
        electronic_signature: 'Claimant',
        targets: [
          {
            post_id: '019f0000-0000-7000-8000-000000000003',
            image_id: '019f0000-0000-7000-8000-000000000004',
            target_url: 'https://voucha.ai/discussion/example',
          },
          {
            post_id: '019f0000-0000-7000-8000-000000000003',
            image_id: '019f0000-0000-7000-8000-000000000005',
            target_url: 'https://voucha.ai/discussion/example',
          },
        ],
        rationale: 'Verified the parsed notice.',
        recommendation_id: '019f0000-0000-7000-8000-000000000002',
        manual_fallback_reason: null,
      })
    })
    expect(screen.getByText('The structured intake was approved.')).toBeInTheDocument()
  })

  it('submits rejection and keeps action failures visible to the moderator', async () => {
    mockReject.mockRejectedValue(new Error('API rejected the action'))
    render(<CopyrightEmailReview data={makeQueuePage()} />)

    await selectEmailIntake()
    fireEvent.change(screen.getByLabelText('Review rationale'), {
      target: { value: 'The notice is incomplete.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reject email intake' }))

    await waitFor(() => {
      expect(mockReject).toHaveBeenCalledWith(
        intakeId,
        'The notice is incomplete.',
        '019f0000-0000-7000-8000-000000000002',
        null,
      )
    })
    expect(screen.getByRole('alert')).toHaveTextContent('API rejected the action')
  })

  it('keeps detail-load failures visible to the moderator', async () => {
    mockGet.mockRejectedValue(new Error('The intake detail is unavailable'))
    render(<CopyrightEmailReview data={makeQueuePage()} />)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(intakeId) }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('The intake detail is unavailable')
    })
  })

  it('clears review state before selecting another email intake', async () => {
    mockGet.mockResolvedValueOnce({
      copyright_email_intake: { ...makeIntake(), recommendation: null },
    })
    mockGet.mockResolvedValueOnce({
      copyright_email_intake: { ...makeIntake(otherIntakeId), recommendation: null },
    })
    const queue = makeQueuePage([makeQueueItem(), makeQueueItem(otherIntakeId)])
    render(<CopyrightEmailReview data={queue} />)

    await selectEmailIntake(intakeId)
    fireEvent.change(screen.getByLabelText('Review rationale'), {
      target: { value: 'Rationale for the first intake.' },
    })
    fireEvent.change(screen.getByLabelText('Manual fallback reason'), {
      target: { value: 'The first intake had no recommendation.' },
    })
    fireEvent.change(screen.getByLabelText('Claimant email'), {
      target: { value: 'first-intake@example.test' },
    })

    await selectEmailIntake(otherIntakeId)

    expect(screen.getByLabelText('Review rationale')).toHaveValue('')
    expect(screen.getByLabelText('Manual fallback reason')).toHaveValue('')
    expect(screen.getByLabelText('Claimant email')).toHaveValue('')
  })

  it('keeps queue-refresh failures visible after an approval', async () => {
    mockApprove.mockResolvedValue(undefined)
    mockList.mockRejectedValue(new Error('The review queue is unavailable'))
    render(<CopyrightEmailReview data={makeQueuePage()} />)

    await selectEmailIntake()
    await selectHostedImage('Claimed image')
    fireEvent.change(screen.getByLabelText('Review rationale'), {
      target: { value: 'The notice is complete.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Approve structured intake' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('The review queue is unavailable')
    })
  })

  it('admits a matched reply with its selected legal classification and fields', async () => {
    mockGet.mockResolvedValue({ copyright_email_intake: makeMatchedIntake() })
    mockAdmitCorrespondence.mockResolvedValue(undefined)
    render(<CopyrightEmailReview data={makeQueuePage([makeMatchedQueueItem()])} />)

    await selectEmailIntake()
    fireEvent.click(screen.getByRole('combobox', { name: 'Classification' }))
    fireEvent.click(screen.getByRole('option', { name: 'Appeal' }))
    fireEvent.change(screen.getByLabelText('Appeal reason'), {
      target: { value: 'The poster owns the material.' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /post-image/ }))
    fireEvent.change(screen.getByLabelText('Review rationale'), {
      target: { value: 'Verified the reply is an appeal.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Admit correspondence' }))

    await waitFor(() => {
      expect(mockAdmitCorrespondence).toHaveBeenCalledWith(intakeId, {
        kind: 'appeal',
        appeal_reason: 'The poster owns the material.',
        target_ids: ['019f0000-0000-7000-8000-000000000005'],
        rationale: 'Verified the reply is an appeal.',
        recommendation_id: '019f0000-0000-7000-8000-000000000002',
        manual_fallback_reason: null,
      })
    })
  })

  it('rejects matched correspondence with the selected classification', async () => {
    mockGet.mockResolvedValue({ copyright_email_intake: makeMatchedIntake() })
    mockRejectCorrespondence.mockResolvedValue(undefined)
    render(<CopyrightEmailReview data={makeQueuePage([makeMatchedQueueItem()])} />)
    await selectEmailIntake()
    fireEvent.change(screen.getByLabelText('Review rationale'), {
      target: { value: 'This reply is not a copyright filing.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reject correspondence' }))
    await waitFor(() => {
      expect(mockRejectCorrespondence).toHaveBeenCalledWith(intakeId, {
        kind: 'supplement',
        rationale: 'This reply is not a copyright filing.',
        recommendation_id: '019f0000-0000-7000-8000-000000000002',
        manual_fallback_reason: null,
      })
    })
  })

  it('does not offer initial-case actions for an unresolved reply', async () => {
    mockGet.mockResolvedValue({
      copyright_email_intake: { ...makeIntake(), review_path: 'unresolved_thread' },
    })
    render(
      <CopyrightEmailReview
        data={makeQueuePage([{ ...makeQueueItem(), review_path: 'unresolved_thread' }])}
      />,
    )

    await selectEmailIntake()

    expect(screen.getByText(/cannot be handled as a separate case/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Approve structured intake' }),
    ).not.toBeInTheDocument()
  })
})

async function selectEmailIntake(id = intakeId) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(id) }))
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Staff-private evidence' })).toBeInTheDocument()
  })
}

async function selectHostedImage(name: string) {
  fireEvent.click(await screen.findByLabelText(`Hosted image 1: ${name}`))
}
