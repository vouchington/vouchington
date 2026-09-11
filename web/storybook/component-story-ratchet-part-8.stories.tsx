import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { componentStoryRatchetParameters } from './component-story-ratchet-parameters'
import {
  ComponentStoryRatchetGrid,
  type RatchetedComponent,
} from './component-story-ratchet-renderer'
import { AddStatusForm as MyRewardsProgramStatusesManagerAddStatusFormAddStatusForm } from '@/components/my/rewards-program-statuses-manager/add-status-form'
import { StatusList as MyRewardsProgramStatusesManagerStatusListStatusList } from '@/components/my/rewards-program-statuses-manager/status-list'
import { StatusSummary as MyRewardsProgramStatusesManagerStatusSummaryStatusSummary } from '@/components/my/rewards-program-statuses-manager/status-summary'
import { RssBookmarkTypeFilter as MyRssBookmarkTypeFilterRssBookmarkTypeFilter } from '@/components/my/rss-bookmark-type-filter'
import { AddCategoryForm as MySpendingCategoriesManagerAddCategoryFormAddCategoryForm } from '@/components/my/spending-categories-manager/add-category-form'
import { CategoryList as MySpendingCategoriesManagerCategoryListCategoryList } from '@/components/my/spending-categories-manager/category-list'
import { CategorySummary as MySpendingCategoriesManagerCategorySummaryCategorySummary } from '@/components/my/spending-categories-manager/category-summary'
import { TotpManager as MyTotpManagerTotpManager } from '@/components/my/totp-manager'
import { AuthenticatorList as MyTotpManagerAuthenticatorListAuthenticatorList } from '@/components/my/totp-manager/authenticator-list'
import { TotpSetupFlow as MyTotpManagerSetupFlowTotpSetupFlow } from '@/components/my/totp-manager/setup-flow'
import { Navbar as NavbarNavbar } from '@/components/navbar'
import { IntentSwitcher as NavbarIntentSwitcherIntentSwitcher } from '@/components/navbar/intent-switcher'
import { ProfileMenu as NavbarProfileMenuProfileMenu } from '@/components/navbar/profile-menu'
import { WriteDialog as NavbarWriteDialogWriteDialog } from '@/components/navbar/write-dialog'
import { NewsCommunityDiscussionAction as NewsNewsCommunityDiscussionActionNewsCommunityDiscussionAction } from '@/components/news/news-community-discussion-action'
import { NewsDiscussMenu as NewsNewsDiscussMenuNewsDiscussMenu } from '@/components/news/news-discuss-menu'
import {
  ShowMoreLink as NewsNewsItemClusterMetaShowMoreLink,
  StoryMeta as NewsNewsItemClusterMetaStoryMeta,
} from '@/components/news/news-item-cluster-meta'

const ratchetedComponentsPart8 = [
  {
    key: 'web/components/my/rewards-program-statuses-manager/add-status-form.tsx#AddStatusForm',
    component: MyRewardsProgramStatusesManagerAddStatusFormAddStatusForm,
  },
  {
    key: 'web/components/my/rewards-program-statuses-manager/status-list.tsx#StatusList',
    component: MyRewardsProgramStatusesManagerStatusListStatusList,
  },
  {
    key: 'web/components/my/rewards-program-statuses-manager/status-summary.tsx#StatusSummary',
    component: MyRewardsProgramStatusesManagerStatusSummaryStatusSummary,
  },
  {
    key: 'web/components/my/rss-bookmark-type-filter.tsx#RssBookmarkTypeFilter',
    component: MyRssBookmarkTypeFilterRssBookmarkTypeFilter,
  },
  {
    key: 'web/components/my/spending-categories-manager/add-category-form.tsx#AddCategoryForm',
    component: MySpendingCategoriesManagerAddCategoryFormAddCategoryForm,
  },
  {
    key: 'web/components/my/spending-categories-manager/category-list.tsx#CategoryList',
    component: MySpendingCategoriesManagerCategoryListCategoryList,
  },
  {
    key: 'web/components/my/spending-categories-manager/category-summary.tsx#CategorySummary',
    component: MySpendingCategoriesManagerCategorySummaryCategorySummary,
  },
  { key: 'web/components/my/totp-manager.tsx#TotpManager', component: MyTotpManagerTotpManager },
  {
    key: 'web/components/my/totp-manager/authenticator-list.tsx#AuthenticatorList',
    component: MyTotpManagerAuthenticatorListAuthenticatorList,
  },
  {
    key: 'web/components/my/totp-manager/setup-flow.tsx#TotpSetupFlow',
    component: MyTotpManagerSetupFlowTotpSetupFlow,
  },
  { key: 'web/components/navbar.tsx#Navbar', component: NavbarNavbar },
  {
    key: 'web/components/navbar/intent-switcher.tsx#IntentSwitcher',
    component: NavbarIntentSwitcherIntentSwitcher,
  },
  {
    key: 'web/components/navbar/profile-menu.tsx#ProfileMenu',
    component: NavbarProfileMenuProfileMenu,
  },
  {
    key: 'web/components/navbar/write-dialog.tsx#WriteDialog',
    component: NavbarWriteDialogWriteDialog,
  },
  {
    key: 'web/components/news/news-community-discussion-action.tsx#NewsCommunityDiscussionAction',
    component: NewsNewsCommunityDiscussionActionNewsCommunityDiscussionAction,
  },
  {
    key: 'web/components/news/news-discuss-menu.tsx#NewsDiscussMenu',
    component: NewsNewsDiscussMenuNewsDiscussMenu,
  },
  {
    key: 'web/components/news/news-item-cluster-meta.tsx#ShowMoreLink',
    component: NewsNewsItemClusterMetaShowMoreLink,
  },
  {
    key: 'web/components/news/news-item-cluster-meta.tsx#StoryMeta',
    component: NewsNewsItemClusterMetaStoryMeta,
  },
] satisfies RatchetedComponent[]

const meta = {
  title: 'Coverage/Component Story Ratchet Part 8',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const CoveragePart8: Story = {
  parameters: componentStoryRatchetParameters,
  render: () => (
    <ComponentStoryRatchetGrid
      title='Component Story Ratchet Part 8'
      components={ratchetedComponentsPart8}
    />
  ),
}
