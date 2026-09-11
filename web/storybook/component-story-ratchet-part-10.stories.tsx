import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { componentStoryRatchetParameters } from './component-story-ratchet-parameters'
import {
  ComponentStoryRatchetGrid,
  type RatchetedComponent,
} from './component-story-ratchet-renderer'
import { PostCardBadges as PostsPostCardPostCardBadgesPostCardBadges } from '@/components/posts/post-card/post-card-badges'
import { PostCardContent as PostsPostCardPostCardContentPostCardContent } from '@/components/posts/post-card/post-card-content'
import { PostCardFooter as PostsPostCardPostCardFooterPostCardFooter } from '@/components/posts/post-card/post-card-footer'
import { PostCardTitle as PostsPostCardPostCardTitlePostCardTitle } from '@/components/posts/post-card/post-card-title'
import { PostDetailActions as PostsPostDetailActionsPostDetailActions } from '@/components/posts/post-detail-actions'
import { PostDetailBadges as PostsPostDetailBadgesPostDetailBadges } from '@/components/posts/post-detail-badges'
import { ImageButton as PostsPostDetailImageButtonImageButton } from '@/components/posts/post-detail-image-button'
import { PostDetailMetadata as PostsPostDetailMetadataPostDetailMetadata } from '@/components/posts/post-detail-metadata'
import { PostDetailOverflowMenu as PostsPostDetailOverflowMenuPostDetailOverflowMenu } from '@/components/posts/post-detail-overflow-menu'
import { PostForm as PostsPostFormPostForm } from '@/components/posts/post-form'
import { ImagesFieldset as PostsPostFormImagesFieldsetImagesFieldset } from '@/components/posts/post-form-images-fieldset'
import { ReviewTopicsFieldset as PostsPostFormSectionsReviewTopicsFieldset } from '@/components/posts/post-form-sections'
import { AdvancedOptions as PostsPostFormAdvancedOptionsAdvancedOptions } from '@/components/posts/post-form/advanced-options'
import {
  AudienceField as PostsPostFormAdvancedOptionsFieldsAudienceField,
  VisibilityField as PostsPostFormAdvancedOptionsFieldsVisibilityField,
} from '@/components/posts/post-form/advanced-options-fields'
import { ContentEditor as PostsPostFormContentEditorContentEditor } from '@/components/posts/post-form/content-editor'
import { FormActions as PostsPostFormFormActionsFormActions } from '@/components/posts/post-form/form-actions'
import { PostArchiveButton as PostsPostFormPostArchiveButtonPostArchiveButton } from '@/components/posts/post-form/post-archive-button'

const ratchetedComponentsPart10 = [
  {
    key: 'web/components/posts/post-card/post-card-badges.tsx#PostCardBadges',
    component: PostsPostCardPostCardBadgesPostCardBadges,
  },
  {
    key: 'web/components/posts/post-card/post-card-content.tsx#PostCardContent',
    component: PostsPostCardPostCardContentPostCardContent,
  },
  {
    key: 'web/components/posts/post-card/post-card-footer.tsx#PostCardFooter',
    component: PostsPostCardPostCardFooterPostCardFooter,
  },
  {
    key: 'web/components/posts/post-card/post-card-title.tsx#PostCardTitle',
    component: PostsPostCardPostCardTitlePostCardTitle,
  },
  {
    key: 'web/components/posts/post-detail-actions.tsx#PostDetailActions',
    component: PostsPostDetailActionsPostDetailActions,
  },
  {
    key: 'web/components/posts/post-detail-badges.tsx#PostDetailBadges',
    component: PostsPostDetailBadgesPostDetailBadges,
  },
  {
    key: 'web/components/posts/post-detail-image-button.tsx#ImageButton',
    component: PostsPostDetailImageButtonImageButton,
  },
  {
    key: 'web/components/posts/post-detail-metadata.tsx#PostDetailMetadata',
    component: PostsPostDetailMetadataPostDetailMetadata,
  },
  {
    key: 'web/components/posts/post-detail-overflow-menu.tsx#PostDetailOverflowMenu',
    component: PostsPostDetailOverflowMenuPostDetailOverflowMenu,
  },
  {
    key: 'web/components/posts/post-form-images-fieldset.tsx#ImagesFieldset',
    component: PostsPostFormImagesFieldsetImagesFieldset,
  },
  {
    key: 'web/components/posts/post-form-sections.tsx#ReviewTopicsFieldset',
    component: PostsPostFormSectionsReviewTopicsFieldset,
  },
  { key: 'web/components/posts/post-form.tsx#PostForm', component: PostsPostFormPostForm },
  {
    key: 'web/components/posts/post-form/advanced-options-fields.tsx#AudienceField',
    component: PostsPostFormAdvancedOptionsFieldsAudienceField,
  },
  {
    key: 'web/components/posts/post-form/advanced-options-fields.tsx#VisibilityField',
    component: PostsPostFormAdvancedOptionsFieldsVisibilityField,
  },
  {
    key: 'web/components/posts/post-form/advanced-options.tsx#AdvancedOptions',
    component: PostsPostFormAdvancedOptionsAdvancedOptions,
  },
  {
    key: 'web/components/posts/post-form/content-editor.tsx#ContentEditor',
    component: PostsPostFormContentEditorContentEditor,
  },
  {
    key: 'web/components/posts/post-form/form-actions.tsx#FormActions',
    component: PostsPostFormFormActionsFormActions,
  },
  {
    key: 'web/components/posts/post-form/post-archive-button.tsx#PostArchiveButton',
    component: PostsPostFormPostArchiveButtonPostArchiveButton,
  },
] satisfies RatchetedComponent[]

const meta = {
  title: 'Coverage/Component Story Ratchet Part 10',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const CoveragePart10: Story = {
  parameters: componentStoryRatchetParameters,
  render: () => (
    <ComponentStoryRatchetGrid
      title='Component Story Ratchet Part 10'
      components={ratchetedComponentsPart10}
    />
  ),
}
