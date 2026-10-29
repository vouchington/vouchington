import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { reviewCopyrightRestriction } from '@/lib/api/client/copyright-notices'
import { listCopyrightGuestCapabilities } from '@/lib/api/client/copyright-guest'
import { makeCopyrightStaffQueueItem } from '@/test-helpers/api-responses/copyright'
import { makeBusyUsStaffCase } from '@/test-helpers/api-responses/copyright-staff-case'
import { CopyrightStaffCase } from './copyright-staff-case'
import type { SubmitReview } from './copyright-staff-review-buttons'

vi.mock(import('@/lib/api/client/copyright-notices'), async importOriginal => ({
  ...(await importOriginal()),
  reviewCopyrightRestriction: vi
    .fn<typeof reviewCopyrightRestriction>()
    .mockResolvedValue(undefined),
}))
vi.mock(import('@/lib/api/client/copyright-guest'), async importOriginal => ({
  ...(await importOriginal()),
  listCopyrightGuestCapabilities: vi.fn<typeof listCopyrightGuestCapabilities>().mockResolvedValue({
    copyright_guest_capabilities: [],
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  }),
}))

const submit: SubmitReview = action => {
  void action()
}

const busyCase = makeBusyUsStaffCase()
const notice = makeCopyrightStaffQueueItem({
  targets: busyCase.targets,
  restrictions: busyCase.restrictions.toReversed().map(restriction => ({
    ...restriction,
    status: 'pending_review',
  })),
})

describe('CopyrightStaffCase restriction decisions', () => {
  it.each([
    ['Confirm restriction', 'confirm'],
    ['Reverse restriction', 'reverse'],
  ] as const)('associates each %s action with its target by identity', async (label, decision) => {
    await act(async () => {
      render(
        <CopyrightStaffCase
          notice={notice}
          pending={false}
          rationale='Reviewed evidence.'
          submit={submit}
          submitRecovery={submit}
        />,
      )
    })

    const sections = screen.getAllByRole('region', { name: /^Restriction review for/ })
    expect(sections).toHaveLength(2)
    for (const [index, restriction] of notice.restrictions.entries()) {
      const target = notice.targets.find(item => item.id === restriction.target_id)!
      const section = sections[index]!
      expect(within(section).getByRole('link', { name: target.hosted_use_url })).toHaveAttribute(
        'href',
        target.hosted_use_url,
      )
      fireEvent.click(within(section).getByRole('button', { name: label }))
      expect(reviewCopyrightRestriction).toHaveBeenLastCalledWith(
        notice.id,
        restriction.id,
        decision,
        'Reviewed evidence.',
      )
    }
  })

  it('describes an unavailable target without displaying its identifier', async () => {
    const restriction = { ...notice.restrictions[0]!, target_id: 'missing-target' }
    await act(async () => {
      render(
        <CopyrightStaffCase
          notice={{ ...notice, restrictions: [restriction] }}
          pending={false}
          rationale='Reviewed evidence.'
          submit={submit}
          submitRecovery={submit}
        />,
      )
    })
    const section = screen.getByRole('region', {
      name: 'Restriction review for unavailable hosted material',
    })
    expect(within(section).getByText('Hosted material reference unavailable.')).toBeInTheDocument()
    expect(within(section).queryByRole('link')).not.toBeInTheDocument()
    expect(section).not.toHaveTextContent('missing-target')
  })
})
