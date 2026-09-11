import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { componentStoryRatchetParameters } from './component-story-ratchet-parameters'
import {
  ComponentStoryRatchetGrid,
  type RatchetedComponent,
} from './component-story-ratchet-renderer'
import { PublicLandingPageTopicGroup as LandingPagesPublicLandingPageTopicGroupPublicLandingPageTopicGroup } from '@/components/landing-pages/public-landing-page-topic-group'
import { AddToListMenuItem as ListsAddToListMenuItemAddToListMenuItem } from '@/components/lists/add-to-list-menu-item'
import { ListImportCommunityDialog as ListsListImportCommunityDialogListImportCommunityDialog } from '@/components/lists/list-import-community-dialog'
import { ListItemRow as ListsListItemRowListItemRow } from '@/components/lists/list-item-row'
import { ListsSidebarGroup as ListsListsSidebarGroupListsSidebarGroup } from '@/components/lists/lists-sidebar-group'
import { CheckoutButton as MembershipsCheckoutButtonCheckoutButton } from '@/components/memberships/checkout-button'
import { FreePlanCard as MembershipsFreePlanCardFreePlanCard } from '@/components/memberships/free-plan-card'
import { MembershipStatus as MembershipsMembershipStatusMembershipStatus } from '@/components/memberships/membership-status'
import { PlanCards as MembershipsPlanCardsPlanCards } from '@/components/memberships/plan-cards'
import { PlanComparisonTable as MembershipsPlanComparisonTablePlanComparisonTable } from '@/components/memberships/plan-comparison-table'
import { PlanFAQ as MembershipsPlanFaqPlanFAQ } from '@/components/memberships/plan-faq'
import { GroupThreadHeader as MessagesGroupThreadHeaderGroupThreadHeader } from '@/components/messages/group-thread-header'
import { MessagesSidebarGroupView as MessagesMessagesSidebarGroupViewMessagesSidebarGroupView } from '@/components/messages/messages-sidebar-group-view'
import { ParticipantsPanel as MessagesParticipantsPanelParticipantsPanel } from '@/components/messages/participants-panel'
import { RecipientPicker as MessagesRecipientPickerRecipientPicker } from '@/components/messages/recipient-picker'
import { ExposureCooldownGate as ModerationExposureCooldownGateExposureCooldownGate } from '@/components/moderation/exposure-cooldown-gate'
import { ExposureCooldownModal as ModerationExposureCooldownModalExposureCooldownModal } from '@/components/moderation/exposure-cooldown-modal'

const ratchetedComponentsPart5 = [
  {
    key: 'web/components/landing-pages/public-landing-page-topic-group.tsx#PublicLandingPageTopicGroup',
    component: LandingPagesPublicLandingPageTopicGroupPublicLandingPageTopicGroup,
  },
  {
    key: 'web/components/lists/add-to-list-menu-item.tsx#AddToListMenuItem',
    component: ListsAddToListMenuItemAddToListMenuItem,
  },
  {
    key: 'web/components/lists/list-import-community-dialog.tsx#ListImportCommunityDialog',
    component: ListsListImportCommunityDialogListImportCommunityDialog,
  },
  {
    key: 'web/components/lists/list-item-row.tsx#ListItemRow',
    component: ListsListItemRowListItemRow,
  },
  {
    key: 'web/components/lists/lists-sidebar-group.tsx#ListsSidebarGroup',
    component: ListsListsSidebarGroupListsSidebarGroup,
  },
  {
    key: 'web/components/memberships/checkout-button.tsx#CheckoutButton',
    component: MembershipsCheckoutButtonCheckoutButton,
  },
  {
    key: 'web/components/memberships/free-plan-card.tsx#FreePlanCard',
    component: MembershipsFreePlanCardFreePlanCard,
  },
  {
    key: 'web/components/memberships/membership-status.tsx#MembershipStatus',
    component: MembershipsMembershipStatusMembershipStatus,
  },
  {
    key: 'web/components/memberships/plan-cards.tsx#PlanCards',
    component: MembershipsPlanCardsPlanCards,
  },
  {
    key: 'web/components/memberships/plan-comparison-table.tsx#PlanComparisonTable',
    component: MembershipsPlanComparisonTablePlanComparisonTable,
  },
  { key: 'web/components/memberships/plan-faq.tsx#PlanFAQ', component: MembershipsPlanFaqPlanFAQ },
  {
    key: 'web/components/messages/group-thread-header.tsx#GroupThreadHeader',
    component: MessagesGroupThreadHeaderGroupThreadHeader,
  },
  {
    key: 'web/components/messages/messages-sidebar-group-view.tsx#MessagesSidebarGroupView',
    component: MessagesMessagesSidebarGroupViewMessagesSidebarGroupView,
  },
  {
    key: 'web/components/messages/participants-panel.tsx#ParticipantsPanel',
    component: MessagesParticipantsPanelParticipantsPanel,
  },
  {
    key: 'web/components/messages/recipient-picker.tsx#RecipientPicker',
    component: MessagesRecipientPickerRecipientPicker,
  },
  {
    key: 'web/components/moderation/exposure-cooldown-gate.tsx#ExposureCooldownGate',
    component: ModerationExposureCooldownGateExposureCooldownGate,
  },
  {
    key: 'web/components/moderation/exposure-cooldown-modal.tsx#ExposureCooldownModal',
    component: ModerationExposureCooldownModalExposureCooldownModal,
  },
] satisfies RatchetedComponent[]

const meta = {
  title: 'Coverage/Component Story Ratchet Part 5',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const CoveragePart5: Story = {
  parameters: componentStoryRatchetParameters,
  render: () => (
    <ComponentStoryRatchetGrid
      title='Component Story Ratchet Part 5'
      components={ratchetedComponentsPart5}
    />
  ),
}
