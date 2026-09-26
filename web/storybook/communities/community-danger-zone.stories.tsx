import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityDangerZone } from '@/components/communities/community-danger-zone'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Community Danger Zone',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function DangerZoneStory({
  error,
  initialArchived,
}: {
  error: string | null
  initialArchived: boolean
}) {
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [isArchived, setIsArchived] = useState(initialArchived)
  return (
    <CommunityDangerZone
      confirmArchive={confirmArchive}
      error={error}
      handleArchive={() => {
        if (confirmArchive) {
          setIsArchived(current => !current)
          setConfirmArchive(false)
        } else {
          setConfirmArchive(true)
        }
        return Promise.resolve()
      }}
      isArchived={isArchived}
      isBusy={false}
      loading={false}
    />
  )
}

export const Archive: Story = {
  render: () => (
    <StoryFrame>
      <DangerZoneStory
        error={null}
        initialArchived={false}
      />
    </StoryFrame>
  ),
}

export const Restore: Story = {
  render: () => (
    <StoryFrame>
      <DangerZoneStory
        error={null}
        initialArchived
      />
    </StoryFrame>
  ),
}

export const ArchiveError: Story = {
  render: () => (
    <StoryFrame>
      <DangerZoneStory
        error='Credit Cards still has an open modmail thread about a Sapphire Reserve referral.'
        initialArchived={false}
      />
    </StoryFrame>
  ),
}
