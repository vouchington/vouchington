import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CopyrightEmailApprovalDraft } from './copyright-email-approval-model'
import { CopyrightEmailApprovalManualTargetFields } from './copyright-email-approval-manual-target-fields'

type ManualTargetProps = React.ComponentProps<typeof CopyrightEmailApprovalManualTargetFields>

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        children,
        value,
        onValueChange,
      }: {
        children: ReactNode
        value: string
        onValueChange: (value: string) => void
      }) => (
        <select
          aria-label='Image surface 1'
          value={value}
          onChange={event => onValueChange(event.target.value)}
        >
          {children}
        </select>
      ),
      SelectContent: ({ children }: { children: ReactNode }) => children,
      SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
        <option value={value}>{children}</option>
      ),
      SelectTrigger: () => null,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

const baseTarget: CopyrightEmailApprovalDraft['targets'][number] = {
  id: 'first',
  group_id: 'group-1',
  surface: 'post-image',
  post_id: 'post-1',
  user_id: 'user-1',
  user_profile_link_id: 'link-1',
  topic_id: 'topic-1',
  community_id: 'community-1',
  image_id: 'image-1',
  target_url: 'https://voucha.ai/discussion/one',
  resolution_status: 'failed',
}
const draft: CopyrightEmailApprovalDraft = {
  jurisdiction: 'us_dmca',
  claimant_display_name: '',
  claimant_contact: '',
  claimant_email: '',
  work_description: '',
  has_good_faith_belief: false,
  has_accuracy_authority_under_penalty_of_perjury: false,
  electronic_signature: '',
  targets: [baseTarget, { ...baseTarget, id: 'second', group_id: 'group-2' }],
}

describe('CopyrightEmailApprovalManualTargetFields', () => {
  it.each([
    ['post-image', 'Post ID', 'post_id'],
    ['user-profile-image', 'User ID', 'user_id'],
    ['user-profile-link-image', 'Profile link ID', 'user_profile_link_id'],
    ['topic-logo-image', 'Topic ID', 'topic_id'],
    ['topic-hero-image', 'Topic ID', 'topic_id'],
    ['community-profile-image', 'Community ID', 'community_id'],
    ['community-banner-image', 'Community ID', 'community_id'],
  ] as const)('edits the %s owner ID in the manual fallback', (surface, label, key) => {
    const updateTarget = vi.fn<ManualTargetProps['updateTarget']>()
    render(
      <CopyrightEmailApprovalManualTargetFields
        target={{ ...baseTarget, surface }}
        index={0}
        draft={draft}
        onChange={vi.fn<ManualTargetProps['onChange']>()}
        updateTarget={updateTarget}
        error='URL lookup failed'
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('URL lookup failed')
    fireEvent.change(screen.getByLabelText(`${label} 1`), { target: { value: 'verified-owner' } })
    fireEvent.change(screen.getByLabelText('Image ID 1'), { target: { value: 'verified-image' } })
    expect(updateTarget).toHaveBeenCalledWith('first', key, 'verified-owner')
    expect(updateTarget).toHaveBeenCalledWith('first', 'image_id', 'verified-image')
  })

  it('clears owner IDs for only the changed target when staff switches image surface', () => {
    const onChange = vi.fn<(next: CopyrightEmailApprovalDraft) => void>()
    render(
      <CopyrightEmailApprovalManualTargetFields
        target={baseTarget}
        index={0}
        draft={draft}
        onChange={onChange}
        updateTarget={vi.fn<ManualTargetProps['updateTarget']>()}
        error={undefined}
      />,
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Image surface 1' }), {
      target: { value: 'community-banner-image' },
    })
    const next = onChange.mock.lastCall?.[0]
    expect(next?.targets[0]).toMatchObject({
      id: 'first',
      surface: 'community-banner-image',
      post_id: '',
      image_id: 'image-1',
      user_id: undefined,
      user_profile_link_id: undefined,
      topic_id: undefined,
      community_id: undefined,
    })
    expect(next?.targets[1]).toEqual(draft.targets[1])
  })
})
