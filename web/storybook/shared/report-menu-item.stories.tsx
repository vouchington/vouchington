import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ReportInlineButton,
  ReportMenuItem,
  ReportMenuKebab,
} from '@/components/shared/report-menu-item'
import { StoryFrame } from '@/storybook/story-frame'
import { posts } from '@/storybook/entities/fixtures/posts'

const discussion = posts.find(post => post.post_type === 'discussion')!
const review = posts.find(post => post.post_type === 'review')!

const meta = {
  title: 'Shared/Report Menu Item',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const InlineAndMenu: Story = {
  render: () => (
    <StoryFrame>
      <div className='flex items-center gap-3'>
        <ReportInlineButton
          entityType='post'
          entityId={discussion.id}
          isAuthenticated
          label='Report discussion'
        />
        <DropdownMenu
          defaultOpen
          modal={false}
        >
          <DropdownMenuTrigger asChild>
            <Button
              type='button'
              variant='outline'
              size='sm'
            >
              Discussion actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <ReportMenuItem
              entityType='post'
              entityId={discussion.id}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </StoryFrame>
  ),
}

export const Kebab: Story = {
  render: () => (
    <StoryFrame>
      <ReportMenuKebab
        entityType='post'
        entityId={review.id}
      />
    </StoryFrame>
  ),
}
