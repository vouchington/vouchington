import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CommunityDangerZone } from '@/components/communities/community-danger-zone'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Community Danger Zone',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function DangerZoneStory({ error, isArchived }: { error: string | null; isArchived: boolean }) {
  const [confirmArchive, setConfirmArchive] = useState(false)
  return (
    <CommunityDangerZone
      confirmArchive={confirmArchive}
      error={error}
      handleArchive={() => {
        setConfirmArchive(true)
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
        isArchived={false}
      />
    </StoryFrame>
  ),
}

export const Restore: Story = {
  render: () => (
    <StoryFrame>
      <DangerZoneStory
        error={null}
        isArchived
      />
    </StoryFrame>
  ),
}

export const ArchiveError: Story = {
  render: () => (
    <StoryFrame>
      <DangerZoneStory
        error='Credit Cards still has an open modmail thread about a Sapphire Reserve referral.'
        isArchived={false}
      />
    </StoryFrame>
  ),
}
