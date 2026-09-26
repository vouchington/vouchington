import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ManageTagsDialog } from '@/components/tags/manage-tags-dialog'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Tags/Manage Tags Dialog',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const RelatedTopics: Story = {
  parameters: { auth: { currentUser: null } },
  render: () => (
    <StoryFrame>
      <ManageTagsDialog
        entityType='topic'
        entityId='storybook-topic'
        predicate='related'
        objectType='topic'
        label='Topic'
        heading='Related topics'
        dialogTitle='Manage related topics'
        triggerLabel='Manage tags'
        loadingText='Loading related topics'
        errorText='Could not load related topics'
        isAuthenticated={false}
      />
    </StoryFrame>
  ),
}
