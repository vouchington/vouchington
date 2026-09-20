import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  approveCopyrightEmailIntake,
  admitCopyrightEmailCorrespondence,
  getCopyrightEmailIntake,
  listCopyrightEmailIntakes,
  rejectCopyrightEmailIntake,
  rejectCopyrightEmailCorrespondence,
} from '@/lib/api/client/copyright-email-intakes'
import { CopyrightEmailReview } from './copyright-email-review'

configure({ testIdAttribute: 'data-pw' })

vi.mock(import('@/lib/api/client/copyright-email-intakes'), () => ({
  approveCopyrightEmailIntake: vi.fn<VitestLooseMock>(),
  admitCopyrightEmailCorrespondence: vi.fn<VitestLooseMock>(),
  getCopyrightEmailIntake: vi.fn<VitestLooseMock>(),
  listCopyrightEmailIntakes: vi.fn<VitestLooseMock>(),
  rejectCopyrightEmailIntake: vi.fn<VitestLooseMock>(),
  rejectCopyrightEmailCorrespondence: vi.fn<VitestLooseMock>(),
}))

const mockApprove = vi.mocked(approveCopyrightEmailIntake)
const mockAdmitCorrespondence = vi.mocked(admitCopyrightEmailCorrespondence)
const mockGet = vi.mocked(getCopyrightEmailIntake)
const mockList = vi.mocked(listCopyrightEmailIntakes)
const mockReject = vi.mocked(rejectCopyrightEmailIntake)
const mockRejectCorrespondence = vi.mocked(rejectCopyrightEmailCorrespondence)
const intakeId = '019f0000-0000-7000-8000-000000000001'

describe('CopyrightEmailReview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue({ copyright_email_intakes: [makeQueueItem()] })
    mockGet.mockResolvedValue({ copyright_email_intake: makeIntake() })
  })

  it('shows private evidence, parsed content, and a recommendation-mapped approval form', async () => {
    render(<CopyrightEmailReview initialItems={[makeQueueItem()]} />)

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
    render(<CopyrightEmailReview initialItems={[makeQueueItem()]} />)

    await selectEmailIntake()
    fireEvent.change(screen.getByLabelText('Claimant email'), {
      target: { value: 'tests+copyright-edited@voucha.ai' },
    })
    fireEvent.change(screen.getByLabelText('Post ID 1'), {
      target: { value: '019f0000-0000-7000-8000-000000000003' },
    })
    fireEvent.change(screen.getByLabelText('Image ID 1'), {
      target: { value: '019f0000-0000-7000-8000-000000000004' },
    })
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
            target_url: 'https://voucha.ai/posts/example',
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
    render(<CopyrightEmailReview initialItems={[makeQueueItem()]} />)

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
    render(<CopyrightEmailReview initialItems={[makeQueueItem()]} />)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(intakeId) }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('The intake detail is unavailable')
    })
  })

  it('keeps queue-refresh failures visible after an approval', async () => {
    mockApprove.mockResolvedValue(undefined)
    mockList.mockRejectedValue(new Error('The review queue is unavailable'))
    render(<CopyrightEmailReview initialItems={[makeQueueItem()]} />)

    await selectEmailIntake()
    resolveFirstTarget()
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
    render(<CopyrightEmailReview initialItems={[makeMatchedQueueItem()]} />)

    await selectEmailIntake()
    fireEvent.change(screen.getByLabelText('Correspondence classification'), {
      target: { value: 'appeal' },
    })
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

  it('does not offer initial-case actions for an unresolved reply', async () => {
    mockGet.mockResolvedValue({
      copyright_email_intake: { ...makeIntake(), review_path: 'unresolved_thread' },
    })
    render(
      <CopyrightEmailReview
        initialItems={[{ ...makeQueueItem(), review_path: 'unresolved_thread' }]}
      />,
    )

    await selectEmailIntake()

    expect(screen.getByText(/cannot be handled as a separate case/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Approve structured intake' }),
    ).not.toBeInTheDocument()
  })
})

async function selectEmailIntake() {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(intakeId) }))
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Staff-private evidence' })).toBeInTheDocument()
  })
}

function resolveFirstTarget() {
  fireEvent.change(screen.getByLabelText('Post ID 1'), {
    target: { value: '019f0000-0000-7000-8000-000000000003' },
  })
  fireEvent.change(screen.getByLabelText('Image ID 1'), {
    target: { value: '019f0000-0000-7000-8000-000000000004' },
  })
}

function makeQueueItem() {
  return {
    id: intakeId,
    received_at: '2026-09-19T00:00:00.000Z',
    parse_status: 'succeeded',
    recommendation_id: '019f0000-0000-7000-8000-000000000002',
    review_path: 'initial' as const,
    linked_notice_id: null,
  }
}

function makeIntake() {
  return {
    id: intakeId,
    received_at: '2026-09-19T00:00:00.000Z',
    review_path: 'initial' as const,
    linked_notice: null,
    raw_email: {
      mime_type: 'message/rfc822',
      byte_size: 1024,
      sha256: 'a'.repeat(64),
      download_url: `/api/v1/copyright-email-intakes/${intakeId}/raw`,
    },
    parsed_email: {
      sender_email: 'tests+copyright-claimant@voucha.ai',
      subject: 'DMCA notice',
      body_text: 'Please remove the image.',
    },
    parser_error: null,
    recommendation: {
      id: '019f0000-0000-7000-8000-000000000002',
      structured_output: {
        claimant_name: 'Claimant',
        claimant_contact: 'tests+copyright-claimant@voucha.ai',
        claimant_email: 'tests+copyright-claimant@voucha.ai',
        work_description: 'Claimant photograph',
        good_faith_belief: true,
        accuracy_authority_under_penalty_of_perjury: true,
        electronic_signature: 'Claimant',
        target_urls: ['https://voucha.ai/posts/example'],
        recommendation: 'potentially_valid',
      },
    },
  }
}

function makeMatchedQueueItem() {
  return {
    ...makeQueueItem(),
    review_path: 'matched_thread' as const,
    linked_notice_id: '019f0000-0000-7000-8000-000000000006',
  }
}

function makeMatchedIntake() {
  return {
    ...makeIntake(),
    review_path: 'matched_thread' as const,
    linked_notice: {
      id: '019f0000-0000-7000-8000-000000000006',
      targets: [
        {
          id: '019f0000-0000-7000-8000-000000000005',
          placement_key: 'post-image:example',
        },
      ],
    },
  }
}
