import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { componentStoryRatchetParameters } from './component-story-ratchet-parameters'
import {
  ComponentStoryRatchetGrid,
  type RatchetedComponent,
} from './component-story-ratchet-renderer'
import { PostSlugField as PostsPostFormPostSlugFieldPostSlugField } from '@/components/posts/post-form/post-slug-field'
import { TitleField as PostsPostFormTitleFieldTitleField } from '@/components/posts/post-form/title-field'
import { PostLockMenuItem as PostsPostLockMenuItemPostLockMenuItem } from '@/components/posts/post-lock-menu-item'
import { SubmitLinkForm as PostsSubmitLinkFormSubmitLinkForm } from '@/components/posts/submit-link-form'
import { UnpublishFromCommunityMenuItem as PostsUnpublishFromCommunityMenuItemUnpublishFromCommunityMenuItem } from '@/components/posts/unpublish-from-community-menu-item'
import { ReferralLinksShowAll as ReferralLinksReferralLinksShowAllReferralLinksShowAll } from '@/components/referral-links/referral-links-show-all'
import { LinkValidationForm as ReferralLinksValidationsLinkValidationFormLinkValidationForm } from '@/components/referral-links/validations/link-validation-form'
import { UnlinkValidationButton as ReferralLinksValidationsUnlinkValidationButtonUnlinkValidationButton } from '@/components/referral-links/validations/unlink-validation-button'
import { RssFeedItemModalFooter as RssFeedItemsRssFeedItemModalFooterRssFeedItemModalFooter } from '@/components/rss-feed-items/rss-feed-item-modal-footer'
import { RssFeedItemModalHeader as RssFeedItemsRssFeedItemModalHeaderRssFeedItemModalHeader } from '@/components/rss-feed-items/rss-feed-item-modal-header'
import { RssFeedItemModalShell as RssFeedItemsRssFeedItemModalShellRssFeedItemModalShell } from '@/components/rss-feed-items/rss-feed-item-modal-shell'
import { ClientSearchForm as SharedClientSearchFormClientSearchForm } from '@/components/shared/client-search-form'
import { FollowButton as SharedFollowButtonFollowButton } from '@/components/shared/follow-button'
import { FollowerSendDialog as SharedFollowerSendDialogFollowerSendDialog } from '@/components/shared/follower-send-dialog'
import { FollowerShareActionButtons as SharedFollowerShareActionButtonsFollowerShareActionButtons } from '@/components/shared/follower-share-action-buttons'
import { HideButton as SharedHideButtonHideButton } from '@/components/shared/hide-button'
import { InfiniteScroll as SharedInfiniteScrollInfiniteScroll } from '@/components/shared/infinite-scroll'

const ratchetedComponentsPart11 = [
  {
    key: 'web/components/posts/post-form/post-slug-field.tsx#PostSlugField',
    component: PostsPostFormPostSlugFieldPostSlugField,
  },
  {
    key: 'web/components/posts/post-form/title-field.tsx#TitleField',
    component: PostsPostFormTitleFieldTitleField,
  },
  {
    key: 'web/components/posts/post-lock-menu-item.tsx#PostLockMenuItem',
    component: PostsPostLockMenuItemPostLockMenuItem,
  },
  {
    key: 'web/components/posts/submit-link-form.tsx#SubmitLinkForm',
    component: PostsSubmitLinkFormSubmitLinkForm,
  },
  {
    key: 'web/components/posts/unpublish-from-community-menu-item.tsx#UnpublishFromCommunityMenuItem',
    component: PostsUnpublishFromCommunityMenuItemUnpublishFromCommunityMenuItem,
  },
  {
    key: 'web/components/referral-links/referral-links-show-all.tsx#ReferralLinksShowAll',
    component: ReferralLinksReferralLinksShowAllReferralLinksShowAll,
  },
  {
    key: 'web/components/referral-links/validations/link-validation-form.tsx#LinkValidationForm',
    component: ReferralLinksValidationsLinkValidationFormLinkValidationForm,
  },
  {
    key: 'web/components/referral-links/validations/unlink-validation-button.tsx#UnlinkValidationButton',
    component: ReferralLinksValidationsUnlinkValidationButtonUnlinkValidationButton,
  },
  {
    key: 'web/components/rss-feed-items/rss-feed-item-modal-footer.tsx#RssFeedItemModalFooter',
    component: RssFeedItemsRssFeedItemModalFooterRssFeedItemModalFooter,
  },
  {
    key: 'web/components/rss-feed-items/rss-feed-item-modal-header.tsx#RssFeedItemModalHeader',
    component: RssFeedItemsRssFeedItemModalHeaderRssFeedItemModalHeader,
  },
  {
    key: 'web/components/rss-feed-items/rss-feed-item-modal-shell.tsx#RssFeedItemModalShell',
    component: RssFeedItemsRssFeedItemModalShellRssFeedItemModalShell,
  },
  {
    key: 'web/components/shared/client-search-form.tsx#ClientSearchForm',
    component: SharedClientSearchFormClientSearchForm,
  },
  {
    key: 'web/components/shared/follow-button.tsx#FollowButton',
    component: SharedFollowButtonFollowButton,
  },
  {
    key: 'web/components/shared/follower-send-dialog.tsx#FollowerSendDialog',
    component: SharedFollowerSendDialogFollowerSendDialog,
  },
  {
    key: 'web/components/shared/follower-share-action-buttons.tsx#FollowerShareActionButtons',
    component: SharedFollowerShareActionButtonsFollowerShareActionButtons,
  },
  {
    key: 'web/components/shared/hide-button.tsx#HideButton',
    component: SharedHideButtonHideButton,
  },
  {
    key: 'web/components/shared/infinite-scroll.tsx#InfiniteScroll',
    component: SharedInfiniteScrollInfiniteScroll,
    props: {
      hasNextPage: false,
      endCursor: null,
      loadingMore: false,
      fetchError: null,
      clearError: () => undefined,
      onLoadMore: async () => undefined,
      children: 'Paginated results',
    },
  },
] satisfies RatchetedComponent[]

const meta = {
  title: 'Coverage/Component Story Ratchet Part 11',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const CoveragePart11: Story = {
  parameters: componentStoryRatchetParameters,
  render: () => (
    <ComponentStoryRatchetGrid
      title='Component Story Ratchet Part 11'
      components={ratchetedComponentsPart11}
    />
  ),
}
