import type { Dispatch, SetStateAction } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TopicRecommendationForm } from '@/components/topic-recommendations/topic-recommendation-form'
import { TopicRecommendationsTable } from '@/components/topic-recommendations/topic-recommendations-table'
import { TopicRecommendationDialog } from '@/components/topic-recommendations/topic-recommendation-dialog'
import {
  buildEditableState,
  type EditableState,
} from '@/components/topic-recommendations/topic-recommendation-editable-state'
import { EntityStoryFrame } from './entity-story-frame'
import {
  approvedRecommendationPost,
  recommendationPost,
  recommendationsMultiStatusResponse,
  rejectedRecommendationPost,
  storyReviewerUsers,
} from './topics-story-recommendations'

const meta = {
  title: 'Entities/TopicRecommendations',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const CreateForm: Story = {
  render: () => (
    <EntityStoryFrame title='Recommend a topic'>
      <fieldset disabled>
        <TopicRecommendationForm />
      </fieldset>
    </EntityStoryFrame>
  ),
}

export const EditForm: Story = {
  render: () => (
    <EntityStoryFrame title='Edit recommendation'>
      <fieldset disabled>
        <TopicRecommendationForm recommendation={recommendationPost} />
      </fieldset>
    </EntityStoryFrame>
  ),
}

export const StatusVariants: Story = {
  render: () => (
    <EntityStoryFrame title='Topic recommendations – all statuses'>
      <TopicRecommendationsTable
        data={recommendationsMultiStatusResponse}
        isAdmin
      />
    </EntityStoryFrame>
  ),
}

const pendingEditableState = buildEditableState(recommendationPost)
const rejectedEditableState = buildEditableState(rejectedRecommendationPost)
const approvedEditableState = buildEditableState(approvedRecommendationPost)

const storyOrderedIds = [
  recommendationPost.id,
  approvedRecommendationPost.id,
  rejectedRecommendationPost.id,
]

const storyElection = {
  id: 'post-election-topic-recommendation-story',
  votes_count_up: 5,
  votes_count_down: 1,
}

// Shared no-op handlers and fixed props for dialog stories
const dialogNoOps = {
  isSaving: false,
  selectedVote: undefined,
  orderedPostIds: storyOrderedIds,
  users: storyReviewerUsers,
  navigateToId: () => {},
  setEditableState: (() => {}) as Dispatch<SetStateAction<EditableState | null>>,
  onApprove: async () => {},
  onOpenChange: () => {},
  onPersistChanges: async () => {},
  onReject: async () => {},
}

export const DialogAdmin: Story = {
  render: () => (
    <EntityStoryFrame title='Review dialog – admin'>
      <TopicRecommendationDialog
        {...dialogNoOps}
        editableState={pendingEditableState}
        isAdmin
        selected={recommendationPost}
        selectedElection={storyElection}
        selectedHtml='<p>Storybook recommendation rationale.</p>'
      />
    </EntityStoryFrame>
  ),
}

export const DialogUser: Story = {
  render: () => (
    <EntityStoryFrame title='Review dialog – user'>
      <TopicRecommendationDialog
        {...dialogNoOps}
        editableState={pendingEditableState}
        isAdmin={false}
        selected={recommendationPost}
        selectedElection={storyElection}
        selectedHtml='<p>Storybook recommendation rationale.</p>'
      />
    </EntityStoryFrame>
  ),
}

export const DialogRejected: Story = {
  render: () => (
    <EntityStoryFrame title='Review dialog – rejected'>
      <TopicRecommendationDialog
        {...dialogNoOps}
        editableState={rejectedEditableState}
        isAdmin
        selected={rejectedRecommendationPost}
        selectedElection={undefined}
        selectedHtml='<p>This recommendation was rejected.</p>'
      />
    </EntityStoryFrame>
  ),
}

export const DialogApproved: Story = {
  render: () => (
    <EntityStoryFrame title='Review dialog – approved'>
      <TopicRecommendationDialog
        {...dialogNoOps}
        editableState={approvedEditableState}
        isAdmin
        selected={approvedRecommendationPost}
        selectedElection={undefined}
        selectedHtml='<p>This recommendation was approved and a topic was created.</p>'
      />
    </EntityStoryFrame>
  ),
}

export const DialogWithNavigation: Story = {
  render: () => (
    <EntityStoryFrame title='Review dialog – with navigation'>
      <TopicRecommendationDialog
        {...dialogNoOps}
        editableState={pendingEditableState}
        isAdmin
        selected={recommendationPost}
        selectedElection={storyElection}
        selectedHtml='<p>Storybook recommendation rationale.</p>'
      />
    </EntityStoryFrame>
  ),
}
