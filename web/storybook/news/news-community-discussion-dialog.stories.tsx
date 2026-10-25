import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { NewsCommunityDiscussionDialog } from '@/components/news/news-community-discussion-dialog'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'News/News Community Discussion Dialog',
  component: OpenDialog,
} satisfies Meta<typeof OpenDialog>

export default meta
type Story = StoryObj<typeof meta>

function OpenDialog() {
  const turnstile = useTurnstileToken('communities.create-post')
  return (
    <StoryFrame>
      <NewsCommunityDiscussionDialog
        fixedCommunity={{
          id: 'community-credit-cards',
          name: 'Credit Cards',
          slug: 'credit-cards',
          visibility: 'public',
        }}
        open
        communities={[]}
        hasLoadedCommunities
        communitySlug='credit-cards'
        isLoadingCommunities={false}
        isSubmitting={false}
        turnstile={turnstile}
        onOpenChange={() => {}}
        onCommunitySlugChange={() => {}}
        onSubmit={() => {}}
      />
    </StoryFrame>
  )
}

export const Ready: Story = { render: () => <OpenDialog /> }
