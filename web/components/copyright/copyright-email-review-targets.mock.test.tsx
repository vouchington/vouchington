import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  approveCopyrightEmailIntake,
  admitCopyrightEmailCorrespondence,
  getCopyrightEmailIntake,
  listCopyrightEmailIntakes,
  rejectCopyrightEmailIntake,
  rejectCopyrightEmailCorrespondence,
} from '@/lib/api/client/copyright-email-intakes'
import { resolveCopyrightNoticeTargets } from '@/lib/api/client/copyright-notice-targets'
import {
  makeCopyrightEmailIntake,
  makeCopyrightEmailQueueItem,
} from '@/test-helpers/components/copyright/copyright-email-review'
import { CopyrightEmailReview } from './copyright-email-review'

vi.mock(import('@/lib/api/client/copyright-email-intakes'), () => ({
  approveCopyrightEmailIntake: vi.fn<typeof approveCopyrightEmailIntake>(),
  admitCopyrightEmailCorrespondence: vi.fn<typeof admitCopyrightEmailCorrespondence>(),
  getCopyrightEmailIntake: vi.fn<typeof getCopyrightEmailIntake>(),
  listCopyrightEmailIntakes: vi.fn<typeof listCopyrightEmailIntakes>(),
  rejectCopyrightEmailIntake: vi.fn<typeof rejectCopyrightEmailIntake>(),
  rejectCopyrightEmailCorrespondence: vi.fn<typeof rejectCopyrightEmailCorrespondence>(),
}))

vi.mock(import('@/lib/api/client/copyright-notice-targets'), () => ({
  resolveCopyrightNoticeTargets: vi.fn<typeof resolveCopyrightNoticeTargets>(),
}))

const mockResolveTargets = vi.mocked(resolveCopyrightNoticeTargets)
const mockGet = vi.mocked(getCopyrightEmailIntake)
const mockList = vi.mocked(listCopyrightEmailIntakes)

describe('CopyrightEmailReview target resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue({ copyright_email_intake: makeCopyrightEmailIntake() })
    mockList.mockResolvedValue({ copyright_email_intakes: [makeCopyrightEmailQueueItem()] })
  })

  it('keeps approval disabled after resolver failure until staff supplies manual verified IDs', async () => {
    mockResolveTargets.mockRejectedValue(new Error('The hosted post is unavailable.'))
    render(<CopyrightEmailReview initialItems={[makeCopyrightEmailQueueItem()]} />)
    fireEvent.click(screen.getByRole('button', { name: /019f0000-0000-7000-8000-000000000001/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('hosted post is unavailable')
    const approve = screen.getByRole('button', { name: 'Approve structured intake' })
    expect(approve).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Post ID 1'), {
      target: { value: '019f0000-0000-7000-8000-000000000003' },
    })
    fireEvent.change(screen.getByLabelText('Image ID 1'), {
      target: { value: '019f0000-0000-7000-8000-000000000004' },
    })
    fireEvent.change(screen.getByLabelText('Review rationale'), {
      target: { value: 'Verified the hosted placement manually.' },
    })

    await waitFor(() => expect(approve).toBeEnabled())
  })
})
