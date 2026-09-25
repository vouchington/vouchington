import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listCopyrightRepeatInfringerAccounts,
  recordCopyrightRepeatInfringerDisposition,
  recordCopyrightRepeatInfringerReinstatement,
  recordCopyrightRepeatInfringerReviewOutcome,
} from '@/lib/api/client/copyright-repeat-infringer'
import { CopyrightRepeatInfringerActions } from './copyright-repeat-infringer-actions'

vi.mock(import('@/lib/api/client/copyright-repeat-infringer'), () => ({
  listCopyrightRepeatInfringerAccounts: vi.fn<VitestLooseMock>(),
  recordCopyrightRepeatInfringerDisposition: vi.fn<VitestLooseMock>(),
  recordCopyrightRepeatInfringerReinstatement: vi.fn<VitestLooseMock>(),
  recordCopyrightRepeatInfringerReviewOutcome: vi.fn<VitestLooseMock>(),
}))

const listAccounts = vi.mocked(listCopyrightRepeatInfringerAccounts)
const recordDisposition = vi.mocked(recordCopyrightRepeatInfringerDisposition)
const recordReinstatement = vi.mocked(recordCopyrightRepeatInfringerReinstatement)
const recordOutcome = vi.mocked(recordCopyrightRepeatInfringerReviewOutcome)

describe('CopyrightRepeatInfringerActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    recordDisposition.mockResolvedValue(undefined)
    recordReinstatement.mockResolvedValue(undefined)
    recordOutcome.mockResolvedValue(undefined)
  })

  it('shows reviewer decisions and hides suspension controls', async () => {
    listAccounts.mockResolvedValue({
      copyright_repeat_infringer_accounts: [
        {
          account_user_id: 'account-1',
          incident_id: 'incident-1',
          operative: true,
          open_review_id: 'review-1',
          termination_in_effect: false,
        },
      ],
    })
    const submit = vi.fn<VitestLooseMock>()
    render(
      <CopyrightRepeatInfringerActions
        canAdminister={false}
        canSubmit
        noticeId='notice-1'
        pending={false}
        rationale='Reviewed.'
        submit={submit}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Show repeat-infringer record' }))
    expect(await screen.findByRole('button', { name: 'Record warning' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restrict account' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mark duplicate' }))
    expect(submit).toHaveBeenCalledOnce()
    const action = submit.mock.calls[0]?.[0] as () => Promise<void>
    await action()
    expect(recordDisposition).toHaveBeenCalledWith('incident-1', 'duplicate', 'Reviewed.')
  })

  it('offers restriction, termination, and reinstatement to an administrator', async () => {
    listAccounts.mockResolvedValue({
      copyright_repeat_infringer_accounts: [
        {
          account_user_id: 'account-1',
          incident_id: 'incident-1',
          operative: true,
          open_review_id: 'review-1',
          termination_in_effect: true,
        },
      ],
    })
    const submit = vi.fn<VitestLooseMock>()
    render(
      <CopyrightRepeatInfringerActions
        canAdminister
        canSubmit
        noticeId='notice-1'
        pending={false}
        rationale='Reviewed.'
        submit={submit}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Show repeat-infringer record' }))
    expect(await screen.findByRole('button', { name: 'Restrict account' })).toBeInTheDocument()
    for (const name of [
      'Mark withdrawn',
      'Mark abusive',
      'Record warning',
      'Record no action',
      'Restrict account',
      'Terminate account',
      'Record reinstatement',
    ]) {
      fireEvent.click(screen.getByRole('button', { name }))
    }
    for (const call of submit.mock.calls) {
      const action = call[0] as () => Promise<void>
      await action()
    }
    expect(recordDisposition).toHaveBeenCalledWith('incident-1', 'withdrawn', 'Reviewed.')
    expect(recordDisposition).toHaveBeenCalledWith('incident-1', 'abusive', 'Reviewed.')
    expect(recordOutcome).toHaveBeenCalledWith('review-1', 'warning', 'Reviewed.')
    expect(recordOutcome).toHaveBeenCalledWith('review-1', 'no_action', 'Reviewed.')
    expect(recordOutcome).toHaveBeenCalledWith('review-1', 'restrict', 'Reviewed.')
    expect(recordOutcome).toHaveBeenCalledWith('review-1', 'terminate', 'Reviewed.')
    expect(recordReinstatement).toHaveBeenCalledWith('account-1', 'Reviewed.')
  })

  it('shows a cleared incident without an open review', async () => {
    listAccounts.mockResolvedValue({
      copyright_repeat_infringer_accounts: [
        {
          account_user_id: 'account-1',
          incident_id: 'incident-1',
          operative: false,
          open_review_id: null,
          termination_in_effect: false,
        },
      ],
    })
    render(
      <CopyrightRepeatInfringerActions
        canAdminister={false}
        canSubmit
        noticeId='notice-1'
        pending={false}
        rationale='Reviewed.'
        submit={vi.fn<VitestLooseMock>()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Show repeat-infringer record' }))
    expect(await screen.findByText('This incident does not count.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record warning' })).not.toBeInTheDocument()
  })

  it('reports an empty record', async () => {
    listAccounts.mockResolvedValue({ copyright_repeat_infringer_accounts: [] })
    render(
      <CopyrightRepeatInfringerActions
        canAdminister={false}
        canSubmit={false}
        noticeId='notice-1'
        pending={false}
        rationale=''
        submit={vi.fn<VitestLooseMock>()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Show repeat-infringer record' }))
    expect(
      await screen.findByText('This case has no repeat-infringer incident.'),
    ).toBeInTheDocument()
  })

  it('reports a failed load', async () => {
    listAccounts.mockRejectedValue(new Error('offline'))
    render(
      <CopyrightRepeatInfringerActions
        canAdminister={false}
        canSubmit={false}
        noticeId='notice-2'
        pending={false}
        rationale=''
        submit={vi.fn<VitestLooseMock>()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Show repeat-infringer record' }))
    await waitFor(() =>
      expect(
        screen.getByText('The repeat-infringer record could not be loaded.'),
      ).toBeInTheDocument(),
    )
  })
})
