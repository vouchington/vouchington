import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { componentStoryRatchetParameters } from './component-story-ratchet-parameters'
import {
  ComponentStoryRatchetGrid,
  type RatchetedComponent,
} from './component-story-ratchet-renderer'
import { ReportDialog as SharedReportDialogReportDialog } from '@/components/shared/report-dialog'
import {
  ReportInlineButton as SharedReportMenuItemReportInlineButton,
  ReportMenuItem as SharedReportMenuItemReportMenuItem,
  ReportMenuKebab as SharedReportMenuItemReportMenuKebab,
} from '@/components/shared/report-menu-item'
import { SaveButton as SharedSaveButtonSaveButton } from '@/components/shared/save-button'
import { SharedByline as SharedSharedBylineSharedByline } from '@/components/shared/shared-byline'
import { UsernameRequiredDialog as SharedUsernameRequiredDialogUsernameRequiredDialog } from '@/components/shared/username-required-dialog'
import { AddSourceButton as SourcesAddSourceButtonAddSourceButton } from '@/components/sources/add-source-button'
import { AddSourceForm as SourcesAddSourceFormAddSourceForm } from '@/components/sources/add-source-form'
import { RssFeedActionSlot as SourcesRssFeedActionSlotRssFeedActionSlot } from '@/components/sources/rss-feed-action-slot'
import { SourceListItem as SourcesSourceListItemSourceListItem } from '@/components/sources/source-list-item'
import {
  SubmitSourceButton as SourcesSubmitSourceDialogSubmitSourceButton,
  SubmitSourceDialog as SourcesSubmitSourceDialogSubmitSourceDialog,
} from '@/components/sources/submit-source-dialog'
import { AddTagForm as TagsAddTagFormAddTagForm } from '@/components/tags/add-tag-form'
import { ManagePostTags as TagsManagePostTagsManagePostTags } from '@/components/tags/manage-post-tags'
import { ManageTagsContent as TagsManageTagsContentManageTagsContent } from '@/components/tags/manage-tags-content'
import { ManageTagsDialog as TagsManageTagsDialogManageTagsDialog } from '@/components/tags/manage-tags-dialog'
import { PostRelatedPostsAsideContent as TagsPostRelatedPostsAsideContentPostRelatedPostsAsideContent } from '@/components/tags/post-related-posts-aside-content'
import { PostRelatedTopicsAsideContent as TagsPostRelatedTopicsAsideContentPostRelatedTopicsAsideContent } from '@/components/tags/post-related-topics-aside-content'

const ratchetedComponentsPart12 = [
  {
    key: 'web/components/shared/report-dialog.tsx#ReportDialog',
    component: SharedReportDialogReportDialog,
  },
  {
    key: 'web/components/shared/report-menu-item.tsx#ReportInlineButton',
    component: SharedReportMenuItemReportInlineButton,
  },
  {
    key: 'web/components/shared/report-menu-item.tsx#ReportMenuItem',
    component: SharedReportMenuItemReportMenuItem,
  },
  {
    key: 'web/components/shared/report-menu-item.tsx#ReportMenuKebab',
    component: SharedReportMenuItemReportMenuKebab,
  },
  {
    key: 'web/components/shared/save-button.tsx#SaveButton',
    component: SharedSaveButtonSaveButton,
  },
  {
    key: 'web/components/shared/shared-byline.tsx#SharedByline',
    component: SharedSharedBylineSharedByline,
  },
  {
    key: 'web/components/shared/username-required-dialog.tsx#UsernameRequiredDialog',
    component: SharedUsernameRequiredDialogUsernameRequiredDialog,
  },
  {
    key: 'web/components/sources/add-source-button.tsx#AddSourceButton',
    component: SourcesAddSourceButtonAddSourceButton,
  },
  {
    key: 'web/components/sources/add-source-form.tsx#AddSourceForm',
    component: SourcesAddSourceFormAddSourceForm,
  },
  {
    key: 'web/components/sources/rss-feed-action-slot.tsx#RssFeedActionSlot',
    component: SourcesRssFeedActionSlotRssFeedActionSlot,
  },
  {
    key: 'web/components/sources/source-list-item.tsx#SourceListItem',
    component: SourcesSourceListItemSourceListItem,
  },
  {
    key: 'web/components/sources/submit-source-dialog.tsx#SubmitSourceButton',
    component: SourcesSubmitSourceDialogSubmitSourceButton,
  },
  {
    key: 'web/components/sources/submit-source-dialog.tsx#SubmitSourceDialog',
    component: SourcesSubmitSourceDialogSubmitSourceDialog,
  },
  { key: 'web/components/tags/add-tag-form.tsx#AddTagForm', component: TagsAddTagFormAddTagForm },
  {
    key: 'web/components/tags/manage-post-tags.tsx#ManagePostTags',
    component: TagsManagePostTagsManagePostTags,
  },
  {
    key: 'web/components/tags/manage-tags-content.tsx#ManageTagsContent',
    component: TagsManageTagsContentManageTagsContent,
  },
  {
    key: 'web/components/tags/manage-tags-dialog.tsx#ManageTagsDialog',
    component: TagsManageTagsDialogManageTagsDialog,
    props: {
      entityType: 'topic',
      entityId: 'storybook-topic',
      predicate: 'related',
      objectType: 'topic',
      label: 'Topic',
      heading: 'Related topics',
      dialogTitle: 'Manage related topics',
      triggerLabel: 'Manage tags',
      loadingText: 'Loading related topics',
      errorText: 'Could not load related topics',
      isAuthenticated: false,
    },
  },
  {
    key: 'web/components/tags/post-related-posts-aside-content.tsx#PostRelatedPostsAsideContent',
    component: TagsPostRelatedPostsAsideContentPostRelatedPostsAsideContent,
  },
  {
    key: 'web/components/tags/post-related-topics-aside-content.tsx#PostRelatedTopicsAsideContent',
    component: TagsPostRelatedTopicsAsideContentPostRelatedTopicsAsideContent,
  },
] satisfies RatchetedComponent[]

const meta = {
  title: 'Coverage/Component Story Ratchet Part 12',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const CoveragePart12: Story = {
  parameters: componentStoryRatchetParameters,
  render: () => (
    <ComponentStoryRatchetGrid
      title='Component Story Ratchet Part 12'
      components={ratchetedComponentsPart12}
    />
  ),
}
