import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TopicRecommendationsTableRow } from '@/components/topic-recommendations/topic-recommendations-table-row'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StoryFrame } from '@/storybook/story-frame'
import {
  recommendationPost,
  recommendationsResponse,
} from '@/storybook/entities/topics-story-recommendations'

const election = recommendationsResponse.post_elections[recommendationPost.id]

const meta = {
  title: 'Topic Recommendations/Table Row',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function RowStory({ isAdmin }: { isAdmin: boolean }) {
  return (
    <StoryFrame width='max-w-5xl'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Recommendation</TableHead>
            <TableHead>Votes</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className='text-right'>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TopicRecommendationsTableRow
            election={election}
            hideDownCount={false}
            isAdmin={isAdmin}
            post={recommendationPost}
            onOpen={() => undefined}
            onWithdraw={() => undefined}
            onQuickApprove={() => undefined}
            onQuickReject={() => undefined}
          />
        </TableBody>
      </Table>
    </StoryFrame>
  )
}

export const Admin: Story = {
  render: () => <RowStory isAdmin />,
}

export const Member: Story = {
  render: () => <RowStory isAdmin={false} />,
}
