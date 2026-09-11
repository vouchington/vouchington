import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Dialog } from '@/components/ui/dialog'
import { DiscussInCommunityActionDialog } from '@/components/posts/discuss-in-community-action-dialog'
import { communities as communityFixtures } from '../entities/entity-fixtures'
import type { Community } from '@/types/api-responses'

const sampleCommunities = communityFixtures as unknown as Community[]

const noopTurnstile = {
  token: 'storybook-turnstile-token',
  reset: () => {},
  containerRef: (_node: HTMLDivElement | null) => {},
  isError: false,
  alwaysApprove: false,
}

const meta = {
  title: 'Design System/Components/Discuss In Community Dialog',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function DiscussInCommunityDialogStory({ communities }: { communities: Community[] }) {
  const [communitySlug, setCommunitySlug] = useState(communities[0]?.slug ?? '')

  return (
    <Dialog defaultOpen>
      <DiscussInCommunityActionDialog
        communities={communities}
        communitySlug={communitySlug}
        onCommunitySlugChange={setCommunitySlug}
        isLoading={false}
        hasLoadedCommunities
        isSubmitting={false}
        turnstile={noopTurnstile}
        onSubmit={() => {}}
      />
    </Dialog>
  )
}

export const Default: Story = {
  render: () => <DiscussInCommunityDialogStory communities={sampleCommunities} />,
}

export const NoCommunities: Story = {
  render: () => <DiscussInCommunityDialogStory communities={[]} />,
}
