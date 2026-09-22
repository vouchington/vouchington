import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  resolveCopyrightNoticeTargets,
  type CopyrightNoticeResolvedTarget,
} from '@/lib/api/client/copyright-notice-targets'
import type { CopyrightEmailApprovalDraft } from './copyright-email-approval-model'
import { CopyrightEmailApprovalTargetFields } from './copyright-email-approval-target-fields'

vi.mock(import('@/lib/api/client/copyright-notice-targets'), () => ({
  resolveCopyrightNoticeTargets: vi.fn<typeof resolveCopyrightNoticeTargets>(),
}))

const mockResolveTargets = vi.mocked(resolveCopyrightNoticeTargets)

describe('CopyrightEmailApprovalTargetFields', () => {
  it('keeps duplicate recommended URLs as separate target groups', () => {
    render(
      <CopyrightEmailApprovalTargetFields
        draft={draft({
          targets: [failedTarget('group-1'), failedTarget('group-2')],
        })}
        onChange={vi.fn<(draft: CopyrightEmailApprovalDraft) => void>()}
      />,
    )

    expect(screen.getAllByDisplayValue('https://voucha.ai/discussion/example')).toHaveLength(2)
  })

  it('hides stale choices while a replacement URL is resolving', async () => {
    const replacement = deferred<CopyrightNoticeResolvedTarget[]>()
    mockResolveTargets
      .mockResolvedValueOnce([resolvedTarget(0)])
      .mockReturnValueOnce(replacement.promise)
    render(<TargetFieldsHarness />)

    expect(await screen.findByLabelText('Hosted image 1: Image 1')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Hosted use URL 1'), {
      target: { value: 'https://voucha.ai/discussion/replacement' },
    })

    expect(screen.queryByLabelText('Hosted image 1: Image 1')).not.toBeInTheDocument()
  })

  it('disables an unselected twenty-first resolved image', async () => {
    mockResolveTargets.mockResolvedValue(
      Array.from({ length: 21 }, (_, index) => resolvedTarget(index)),
    )
    render(<TargetFieldsHarness />)

    for (let index = 1; index <= 20; index++) {
      fireEvent.click(await screen.findByLabelText(`Hosted image ${index}: Image ${index}`))
    }

    expect(screen.getByLabelText('Hosted image 21: Image 21')).toBeDisabled()
  })

  it('does not append a twenty-first target from another resolved group', async () => {
    mockResolveTargets.mockResolvedValue([resolvedTarget(0), resolvedTarget(1)])
    render(<TargetFieldsHarness initialDraft={draft({ targets: fullTargetRows() })} />)

    fireEvent.click(await screen.findByLabelText('Hosted image 1: Image 1'))

    expect(screen.getByLabelText('Hosted image 2: Image 2')).toBeDisabled()
  })
})

function TargetFieldsHarness({
  initialDraft = draft(),
}: {
  initialDraft?: CopyrightEmailApprovalDraft
}) {
  const [draftValue, setDraftValue] = useState(initialDraft)
  return (
    <CopyrightEmailApprovalTargetFields
      draft={draftValue}
      onChange={setDraftValue}
    />
  )
}

function draft(overrides: Partial<CopyrightEmailApprovalDraft> = {}): CopyrightEmailApprovalDraft {
  return {
    jurisdiction: 'us_dmca',
    claimant_display_name: 'Claimant',
    claimant_contact: 'claimant@example.test',
    claimant_email: 'claimant@example.test',
    work_description: 'Photograph',
    electronic_signature: 'Claimant',
    good_faith_belief: true,
    accuracy_authority_under_penalty_of_perjury: true,
    targets: [
      {
        id: 'target-1',
        group_id: 'group-1',
        post_id: '',
        image_id: '',
        target_url: 'https://voucha.ai/discussion/example',
        resolution_status: 'pending',
      },
    ],
    ...overrides,
  }
}

function failedTarget(groupId: string) {
  return {
    ...draft().targets[0]!,
    id: `target-${groupId}`,
    group_id: groupId,
    resolution_status: 'failed' as const,
  }
}

function resolvedTarget(index: number): CopyrightNoticeResolvedTarget {
  return {
    post_id: '019f0000-0000-7000-8000-000000000003',
    image_id: `019f0000-0000-7000-8000-${String(index).padStart(12, '0')}`,
    target_url: 'https://voucha.ai/discussion/example',
    order_index: index,
    caption: `Image ${index + 1}`,
  }
}

function fullTargetRows() {
  const target = draft().targets[0]!
  return [
    target,
    ...Array.from({ length: 19 }, (_, index) => ({
      ...target,
      id: `manual-${index}`,
      group_id: `manual-group-${index}`,
      post_id: `post-${index}`,
      image_id: `image-${index}`,
      target_url: `https://voucha.ai/discussion/manual-${index}`,
      resolution_status: 'failed' as const,
    })),
  ]
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => {
    resolve = next
  })
  return { promise, resolve }
}
