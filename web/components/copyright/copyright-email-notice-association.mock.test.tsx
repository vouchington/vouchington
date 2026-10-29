import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  copyrightEmailIntakesClientMock as intakesClient,
  copyrightNoticePickerClientMock as pickerClient,
  copyrightNoticeTargetsClientMock as targetsClient,
} from '@/test-helpers/components/copyright/copyright-email-client-mocks'
import {
  getCopyrightEmailQueueButton,
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
vi.mock(import('@/lib/api/client/copyright-notice-association-search'), () => pickerClient)

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
    pickerClient.searchCopyrightNoticeAssociationTargets.mockResolvedValue({
      copyright_notices: [
        {
          id: noticeId,
          jurisdiction: 'us_dmca',
          received_at: '2026-10-13T12:00:00.000Z',
          claimant_display_name: 'Dana Whitfield',
          work_description: 'Harbour photograph',
        },
      ],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })
    render(
      <CopyrightEmailReview
        data={makeCopyrightEmailQueuePage([
          { ...makeCopyrightEmailQueueItem(), review_path: 'unresolved_thread' },
        ])}
      />,
    )
    fireEvent.click(getCopyrightEmailQueueButton(intakeId)!)
    await screen.findByRole('heading', { name: 'Staff-private evidence' })
    fireEvent.change(screen.getByLabelText('Find existing copyright notice'), {
      target: { value: 'Dana' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /Dana Whitfield/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Associate with existing notice' }))
    await waitFor(() => {
      expect(intakesClient.associateCopyrightEmailIntakeWithNotice).toHaveBeenCalledWith(
        intakeId,
        noticeId,
      )
    })
  })

  it('keeps initial-case approval separate from manual notice association', async () => {
    intakesClient.getCopyrightEmailIntake.mockResolvedValue({
      copyright_email_intake: { ...makeCopyrightEmailIntake(), review_path: 'initial' },
    })
    render(<CopyrightEmailReview data={makeCopyrightEmailQueuePage()} />)
    fireEvent.click(getCopyrightEmailQueueButton(intakeId)!)
    await screen.findByRole('heading', { name: 'Staff-private evidence' })

    expect(screen.queryByLabelText('Find existing copyright notice')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve structured intake' })).toBeInTheDocument()
  })
})
