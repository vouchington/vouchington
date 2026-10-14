import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  copyrightEmailIntakesClientMock as intakesClient,
  copyrightNoticePickerClientMock as pickerClient,
  copyrightNoticeTargetsClientMock as targetsClient,
} from '@/test-helpers/components/copyright/copyright-email-client-mocks'
import {
  copyrightEmailIntakeId as intakeId,
  makeCopyrightEmailIntake,
  makeCopyrightEmailQueueItem,
  makeCopyrightEmailQueuePage,
} from '@/test-helpers/components/copyright/copyright-email-review'
import { CopyrightEmailReview } from './copyright-email-review'

configure({ testIdAttribute: 'data-pw' })
vi.mock(import('@/lib/api/client/copyright-email-intakes'), () => intakesClient)
vi.mock(import('@/lib/api/client/copyright-notice-targets'), async importOriginal => ({
  ...(await importOriginal()),
  ...targetsClient,
}))
vi.mock(import('@/lib/api/client/copyright-notice-association-target'), () => pickerClient)

describe('manual copyright email notice association', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    intakesClient.listCopyrightEmailIntakes.mockResolvedValue(makeCopyrightEmailQueuePage())
    targetsClient.resolveCopyrightNoticeTargets.mockResolvedValue([])
  })

  it('lets staff select an existing notice for an unresolved reply', async () => {
    const noticeId = '019f0000-0000-7000-8000-000000000009'
    intakesClient.getCopyrightEmailIntake.mockResolvedValue({
      copyright_email_intake: {
        ...makeCopyrightEmailIntake(),
        review_path: 'unresolved_thread',
      },
    })
    intakesClient.associateCopyrightEmailIntakeWithNotice.mockResolvedValue({
      copyright_notice: { id: noticeId },
      copyright_email_intake: { id: intakeId },
    })
    pickerClient.getCopyrightNoticeAssociationTarget.mockResolvedValue({
      copyright_notice: {
        id: noticeId,
        jurisdiction: 'us_dmca',
        received_at: '2026-10-13T12:00:00.000Z',
      },
    })
    render(
      <CopyrightEmailReview
        data={makeCopyrightEmailQueuePage([
          { ...makeCopyrightEmailQueueItem(), review_path: 'unresolved_thread' },
        ])}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: new RegExp(intakeId) }))
    await screen.findByRole('heading', { name: 'Staff-private evidence' })
    fireEvent.change(screen.getByLabelText('Find existing copyright notice'), {
      target: { value: noticeId },
    })
    fireEvent.click(await screen.findByRole('option', { name: new RegExp(noticeId) }))
    fireEvent.click(screen.getByRole('button', { name: 'Associate with existing notice' }))
    await waitFor(() => {
      expect(intakesClient.associateCopyrightEmailIntakeWithNotice).toHaveBeenCalledWith(
        intakeId,
        noticeId,
      )
    })
  })
})
