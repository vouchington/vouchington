import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { componentStoryRatchetParameters } from './component-story-ratchet-parameters'
import {
  ComponentStoryRatchetGrid,
  type RatchetedComponent,
} from './component-story-ratchet-renderer'
import { NewsItemClusterRelatedItems as NewsNewsItemClusterRelatedItemsNewsItemClusterRelatedItems } from '@/components/news/news-item-cluster-related-items'
import { NewsItemStoryCard as NewsNewsItemClusterStoryCardNewsItemStoryCard } from '@/components/news/news-item-cluster-story-card'
import { InboxButton as NotificationsInboxButtonInboxButton } from '@/components/notifications/inbox-button'
import { NotificationRow as NotificationsNotificationRowNotificationRow } from '@/components/notifications/notification-row'
import { NotificationsHeader as NotificationsNotificationsHeaderNotificationsHeader } from '@/components/notifications/notifications-header'
import { PushNotificationsPanel as NotificationsPushNotificationsPanelPushNotificationsPanel } from '@/components/notifications/push-notifications-panel'
import { BankAccountFields as PostsBankAccountFieldsBankAccountFields } from '@/components/posts/bank-account-fields'
import { CreditCardFields as PostsCreditCardFieldsCreditCardFields } from '@/components/posts/credit-card-fields'
import { DataPointCreditCardProfileFields as PostsDataPointCreditCardProfileFieldsDataPointCreditCardProfileFields } from '@/components/posts/data-point-credit-card-profile-fields'
import { DataPointFields as PostsDataPointFieldsDataPointFields } from '@/components/posts/data-point-fields'
import { DataPointProfileFields as PostsDataPointProfileFieldsDataPointProfileFields } from '@/components/posts/data-point-profile-fields'
import { DeletePostMenuItem as PostsDeletePostMenuItemDeletePostMenuItem } from '@/components/posts/delete-post-menu-item'
import { DiscussInCommunityAction as PostsDiscussInCommunityActionDiscussInCommunityAction } from '@/components/posts/discuss-in-community-action'
import { EditPostPage as PostsEditPostPageEditPostPage } from '@/components/posts/edit-post-page'
import { FollowerShareMenuItems as PostsFollowerShareMenuItemsFollowerShareMenuItems } from '@/components/posts/follower-share-menu-items'
import { LinkPostMedia as PostsLinkPostMediaIndexLinkPostMedia } from '@/components/posts/link-post-media/index'
import { PinCommunityPostMenuItem as PostsPinCommunityPostMenuItemPinCommunityPostMenuItem } from '@/components/posts/pin-community-post-menu-item'
import { PostCard as PostsPostCardPostCard } from '@/components/posts/post-card'

const ratchetedComponentsPart9 = [
  {
    key: 'web/components/news/news-item-cluster-related-items.tsx#NewsItemClusterRelatedItems',
    component: NewsNewsItemClusterRelatedItemsNewsItemClusterRelatedItems,
  },
  {
    key: 'web/components/news/news-item-cluster-story-card.tsx#NewsItemStoryCard',
    component: NewsNewsItemClusterStoryCardNewsItemStoryCard,
  },
  {
    key: 'web/components/notifications/inbox-button.tsx#InboxButton',
    component: NotificationsInboxButtonInboxButton,
  },
  {
    key: 'web/components/notifications/notification-row.tsx#NotificationRow',
    component: NotificationsNotificationRowNotificationRow,
  },
  {
    key: 'web/components/notifications/notifications-header.tsx#NotificationsHeader',
    component: NotificationsNotificationsHeaderNotificationsHeader,
  },
  {
    key: 'web/components/notifications/push-notifications-panel.tsx#PushNotificationsPanel',
    component: NotificationsPushNotificationsPanelPushNotificationsPanel,
  },
  {
    key: 'web/components/posts/bank-account-fields.tsx#BankAccountFields',
    component: PostsBankAccountFieldsBankAccountFields,
  },
  {
    key: 'web/components/posts/credit-card-fields.tsx#CreditCardFields',
    component: PostsCreditCardFieldsCreditCardFields,
  },
  {
    key: 'web/components/posts/data-point-credit-card-profile-fields.tsx#DataPointCreditCardProfileFields',
    component: PostsDataPointCreditCardProfileFieldsDataPointCreditCardProfileFields,
  },
  {
    key: 'web/components/posts/data-point-fields.tsx#DataPointFields',
    component: PostsDataPointFieldsDataPointFields,
  },
  {
    key: 'web/components/posts/data-point-profile-fields.tsx#DataPointProfileFields',
    component: PostsDataPointProfileFieldsDataPointProfileFields,
  },
  {
    key: 'web/components/posts/delete-post-menu-item.tsx#DeletePostMenuItem',
    component: PostsDeletePostMenuItemDeletePostMenuItem,
  },
  {
    key: 'web/components/posts/discuss-in-community-action.tsx#DiscussInCommunityAction',
    component: PostsDiscussInCommunityActionDiscussInCommunityAction,
  },
  {
    key: 'web/components/posts/edit-post-page.tsx#EditPostPage',
    component: PostsEditPostPageEditPostPage,
  },
  {
    key: 'web/components/posts/follower-share-menu-items.tsx#FollowerShareMenuItems',
    component: PostsFollowerShareMenuItemsFollowerShareMenuItems,
  },
  {
    key: 'web/components/posts/link-post-media/index.tsx#LinkPostMedia',
    component: PostsLinkPostMediaIndexLinkPostMedia,
  },
  {
    key: 'web/components/posts/pin-community-post-menu-item.tsx#PinCommunityPostMenuItem',
    component: PostsPinCommunityPostMenuItemPinCommunityPostMenuItem,
  },
  { key: 'web/components/posts/post-card.tsx#PostCard', component: PostsPostCardPostCard },
] satisfies RatchetedComponent[]

const meta = {
  title: 'Coverage/Component Story Ratchet Part 9',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const CoveragePart9: Story = {
  parameters: componentStoryRatchetParameters,
  render: () => (
    <ComponentStoryRatchetGrid
      title='Component Story Ratchet Part 9'
      components={ratchetedComponentsPart9}
    />
  ),
}
