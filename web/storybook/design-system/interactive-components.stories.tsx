import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Check, X } from 'lucide-react'
import { ClearButton } from '@/components/votes/clear-button'
import { ScoreVote } from '@/components/votes/score-vote'
import {
  BinaryVote,
  ChoiceGroup,
  CompactVote,
  VoteCounts,
} from '@/components/votes/score-vote-controls'
import type { ScoreVoteState } from '@/components/votes/score-vote-types'
import { EntityBookmarkButton } from '@/components/shared/entity-bookmark-button'
import { ImageUploadButton } from '@/components/shared/image-upload-button'
import { DismissibleCtaAside } from '@/components/asides/dismissible-cta-aside'
import { CommunityProxyBookmarkButton } from '@/components/communities/community-proxy-bookmark-button'
import { UserSignalElectionCard } from '@/components/users/user-signal-election-card'
import { UserVouchElectionCard } from '@/components/users/user-vouch-election-card'

const meta = {
  title: 'Design System/Interactive Components',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-3xl flex-col gap-5 rounded-md border p-4'>{children}</div>
  </main>
)

const noopSubmitVote = async () => {}
const noopUpload = async (_imageId: string) => {}
const semanticVoteState: ScoreVoteState = {
  currentVote: 'like',
  countUp: 22,
  countDown: 7,
  isLoading: false,
  handleVote: noopSubmitVote,
  handleClear: noopSubmitVote,
}
const signalCardActions = [
  {
    choice: 'vouch' as const,
    label: 'Approve',
    ariaLabel: 'Approve',
    tooltip: 'Submit approval',
    successMessage: 'Approved.',
    icon: Check,
  },
  {
    choice: 'disavow' as const,
    label: 'Reject',
    ariaLabel: 'Reject',
    tooltip: 'Submit rejection',
    successMessage: 'Rejected.',
    icon: X,
  },
] as const

export const ScoreVoteVariants: Story = {
  render: () => (
    <Frame>
      <CompactVote
        choices={['vouch', 'like', 'neutral', 'dislike', 'disavow']}
        dataPw='storybook-semantic-compact'
        vote={semanticVoteState}
      />
      <ChoiceGroup
        choices={['vouch', 'like', 'neutral', 'dislike', 'disavow']}
        dataPw='storybook-semantic-group'
        vote={semanticVoteState}
      />
      <BinaryVote
        choices={['support', 'oppose']}
        dataPw='storybook-semantic-binary'
        vote={{ ...semanticVoteState, currentVote: 'support' }}
      />
      <VoteCounts vote={semanticVoteState} />
      <ClearButton vote={semanticVoteState} />
      <ScoreVote
        electionId='storybook-semantic-score-vote'
        countUp={22}
        countDown={7}
        existingVoteChoice='like'
        submitVote={noopSubmitVote}
        clearVote={noopSubmitVote}
        data-pw='storybook-semantic-score-vote'
      />
    </Frame>
  ),
}

// A never-resolving submitVote keeps the choice in the in-flight disabled state
// so the play function can assert the no-dim invariant:
// disabled:opacity-100 overrides the base disabled:opacity-50, keeping the choice
// visually solid (opacity 1) while the optimistic update is already visible.
const hangingSubmitVote = () => new Promise<void>(() => {})

export const ScoreVoteNoFlicker: Story = {
  render: () => (
    <Frame>
      <ScoreVote
        electionId='storybook-no-flicker'
        countUp={5}
        countDown={2}
        submitVote={hangingSubmitVote}
        clearVote={hangingSubmitVote}
        data-pw='storybook-vote-no-flicker'
      />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Choose a vote' }))
    const body = within(canvasElement.ownerDocument.body)
    const vouchChoice = await body.findByRole('radio', { name: 'Vouch' })
    await userEvent.click(vouchChoice)
    // The choice is disabled (double-submit guard) while the PUT is in flight.
    await expect(vouchChoice).toBeDisabled()
    await expect(vouchChoice).toBeChecked()
    // Must NOT visually dim — the optimistic update already changed choice + count.
    await expect(getComputedStyle(vouchChoice).opacity).toBe('1')
  },
}

export const SharedButtons: Story = {
  render: () => (
    <Frame>
      <EntityBookmarkButton
        entityType='topic'
        entityId='storybook-topic'
        preset='subscribe'
        initialActive={false}
      />
      <ImageUploadButton onUploaded={noopUpload} />
      <CommunityProxyBookmarkButton
        communityId='storybook-community'
        kind='follow'
        initialActive={false}
      />
    </Frame>
  ),
}

export const UserElectionCards: Story = {
  render: () => (
    <Frame>
      <UserSignalElectionCard
        userId='storybook-user'
        title='Signal Check'
        description='Configurable user signal card.'
        submitVote={noopSubmitVote}
        clearVote={noopSubmitVote}
        initialChoice='vouch'
        errorMessage='Failed to update signal.'
        actions={signalCardActions}
      />
      <UserVouchElectionCard
        userId='storybook-user'
        displayName='Alex'
        submitVote={noopSubmitVote}
        onDisavowSubmitted={() => undefined}
      />
    </Frame>
  ),
}

export const DismissibleCtaAsideDefault: Story = {
  render: () => (
    <Frame>
      <DismissibleCtaAside
        dismissKey='storybook-cta-aside'
        title='Complete your profile'
        description='Add a bio and links to help others find you.'
        href='/settings'
        actionLabel='Go to settings'
      />
    </Frame>
  ),
}
