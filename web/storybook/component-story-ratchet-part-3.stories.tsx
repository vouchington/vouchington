import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { componentStoryRatchetParameters } from './component-story-ratchet-parameters'
import {
  ComponentStoryRatchetGrid,
  type RatchetedComponent,
} from './component-story-ratchet-renderer'
import { ResultGroups as CommandSearchResultGroupsResultGroups } from '@/components/command-search/result-groups'
import { SearchTabs as CommandSearchSearchTabsSearchTabs } from '@/components/command-search/search-tabs'
import { CommentNode as CommentsCommentNodeCommentNode } from '@/components/comments/comment-node'
import { CommentNodeActions as CommentsCommentNodeActionsCommentNodeActions } from '@/components/comments/comment-node-actions'
import { CommentNodeContent as CommentsCommentNodeContentCommentNodeContent } from '@/components/comments/comment-node-content'
import { CommentNodeEditForm as CommentsCommentNodeEditFormCommentNodeEditForm } from '@/components/comments/comment-node-edit-form'
import { CommentNodeHeader as CommentsCommentNodeHeaderCommentNodeHeader } from '@/components/comments/comment-node-header'
import { CommentPermalink as CommentsCommentPermalinkCommentPermalink } from '@/components/comments/comment-permalink'
import { CommentReplyForm as CommentsCommentReplyFormCommentReplyForm } from '@/components/comments/comment-reply-form'
import { CommentSignInPrompt as CommentsCommentSignInPromptCommentSignInPrompt } from '@/components/comments/comment-sign-in-prompt'
import { CommentTree as CommentsCommentTreeCommentTree } from '@/components/comments/comment-tree'
import { DeleteCommentButton as CommentsDeleteCommentButtonDeleteCommentButton } from '@/components/comments/delete-comment-button'
import { CommunitiesSidebarGroup as CommunitiesCommunitiesSidebarGroupCommunitiesSidebarGroup } from '@/components/communities/communities-sidebar-group'
import { CommunityAgentPromptForm as CommunitiesCommunityAgentPromptFormCommunityAgentPromptForm } from '@/components/communities/community-agent-prompt-form'
import { CommunityAgentPromptHistory as CommunitiesCommunityAgentPromptHistoryCommunityAgentPromptHistory } from '@/components/communities/community-agent-prompt-history'
import { CommunityAgentPromptItem as CommunitiesCommunityAgentPromptItemCommunityAgentPromptItem } from '@/components/communities/community-agent-prompt-item'
import { CommunityAgentPromptsPanel as CommunitiesCommunityAgentPromptsPanelCommunityAgentPromptsPanel } from '@/components/communities/community-agent-prompts-panel'
import { CommunityAutomodReviewPanel as CommunitiesCommunityAutomodReviewPanelCommunityAutomodReviewPanel } from '@/components/communities/community-automod-review-panel'

const ratchetedComponentsPart3 = [
  {
    key: 'web/components/command-search/result-groups.tsx#ResultGroups',
    component: CommandSearchResultGroupsResultGroups,
  },
  {
    key: 'web/components/command-search/search-tabs.tsx#SearchTabs',
    component: CommandSearchSearchTabsSearchTabs,
  },
  {
    key: 'web/components/comments/comment-node-actions.tsx#CommentNodeActions',
    component: CommentsCommentNodeActionsCommentNodeActions,
  },
  {
    key: 'web/components/comments/comment-node-content.tsx#CommentNodeContent',
    component: CommentsCommentNodeContentCommentNodeContent,
  },
  {
    key: 'web/components/comments/comment-node-edit-form.tsx#CommentNodeEditForm',
    component: CommentsCommentNodeEditFormCommentNodeEditForm,
  },
  {
    key: 'web/components/comments/comment-node-header.tsx#CommentNodeHeader',
    component: CommentsCommentNodeHeaderCommentNodeHeader,
  },
  {
    key: 'web/components/comments/comment-node.tsx#CommentNode',
    component: CommentsCommentNodeCommentNode,
  },
  {
    key: 'web/components/comments/comment-permalink.tsx#CommentPermalink',
    component: CommentsCommentPermalinkCommentPermalink,
  },
  {
    key: 'web/components/comments/comment-reply-form.tsx#CommentReplyForm',
    component: CommentsCommentReplyFormCommentReplyForm,
  },
  {
    key: 'web/components/comments/comment-sign-in-prompt.tsx#CommentSignInPrompt',
    component: CommentsCommentSignInPromptCommentSignInPrompt,
  },
  {
    key: 'web/components/comments/comment-tree.tsx#CommentTree',
    component: CommentsCommentTreeCommentTree,
  },
  {
    key: 'web/components/comments/delete-comment-button.tsx#DeleteCommentButton',
    component: CommentsDeleteCommentButtonDeleteCommentButton,
  },
  {
    key: 'web/components/communities/communities-sidebar-group.tsx#CommunitiesSidebarGroup',
    component: CommunitiesCommunitiesSidebarGroupCommunitiesSidebarGroup,
  },
  {
    key: 'web/components/communities/community-agent-prompt-form.tsx#CommunityAgentPromptForm',
    component: CommunitiesCommunityAgentPromptFormCommunityAgentPromptForm,
  },
  {
    key: 'web/components/communities/community-agent-prompt-history.tsx#CommunityAgentPromptHistory',
    component: CommunitiesCommunityAgentPromptHistoryCommunityAgentPromptHistory,
  },
  {
    key: 'web/components/communities/community-agent-prompt-item.tsx#CommunityAgentPromptItem',
    component: CommunitiesCommunityAgentPromptItemCommunityAgentPromptItem,
  },
  {
    key: 'web/components/communities/community-agent-prompts-panel.tsx#CommunityAgentPromptsPanel',
    component: CommunitiesCommunityAgentPromptsPanelCommunityAgentPromptsPanel,
  },
  {
    key: 'web/components/communities/community-automod-review-panel.tsx#CommunityAutomodReviewPanel',
    component: CommunitiesCommunityAutomodReviewPanelCommunityAutomodReviewPanel,
  },
] satisfies RatchetedComponent[]

const meta = {
  title: 'Coverage/Component Story Ratchet Part 3',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const CoveragePart3: Story = {
  parameters: componentStoryRatchetParameters,
  render: () => (
    <ComponentStoryRatchetGrid
      title='Component Story Ratchet Part 3'
      components={ratchetedComponentsPart3}
    />
  ),
}
