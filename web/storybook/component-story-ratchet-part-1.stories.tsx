import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { componentStoryRatchetParameters } from './component-story-ratchet-parameters'
import {
  ComponentStoryRatchetGrid,
  type RatchetedComponent,
} from './component-story-ratchet-renderer'
import AdminAdminModerationButtonDefault from '@/components/admin/admin-moderation-button'
import AdminGrowthGrowthDashboardDefault from '@/components/admin/growth/growth-dashboard'
import { KpiCards as AdminGrowthKpiCardsKpiCards } from '@/components/admin/growth/kpi-cards'
import { MemberReportRow as AdminMemberReportRowMemberReportRow } from '@/components/admin/member-report-row'
import AdminModerationAnalyticsModerationAnalyticsDashboardDefault from '@/components/admin/moderation-analytics/moderation-analytics-dashboard'
import { OfficialReferralLinkForm as AdminOfficialReferralLinksOfficialReferralLinkFormOfficialReferralLinkForm } from '@/components/admin/official-referral-links/official-referral-link-form'
import { ValidationForm as AdminReferralLinkValidationsValidationFormValidationForm } from '@/components/admin/referral-link-validations/validation-form'
import { ValidationsListTable as AdminReferralLinkValidationsValidationsListTableValidationsListTable } from '@/components/admin/referral-link-validations/validations-list-table'
import { CreateTopicIdentityFields as AdminTopicsCreateTopicIdentityFieldsCreateTopicIdentityFields } from '@/components/admin/topics/create-topic-identity-fields'
import { AppSidebar as AppSidebarAppSidebar } from '@/components/app-sidebar'
import { AppSidebarNavGroup as AppSidebarNavSectionAppSidebarNavGroup } from '@/components/app-sidebar/nav-section'
import { SimpleSidebarSection as AppSidebarSimpleSectionSimpleSidebarSection } from '@/components/app-sidebar/simple-section'
import { AppealDialog as AppealsAppealDialogAppealDialog } from '@/components/appeals/appeal-dialog'
import { AppealForm as AppealsAppealFormAppealForm } from '@/components/appeals/appeal-form'
import { AsideDrawer as AsideDrawerAsideDrawer } from '@/components/aside-drawer'

const ratchetedComponentsPart1 = [
  {
    key: 'web/components/admin/admin-moderation-button.tsx#default',
    component: AdminAdminModerationButtonDefault,
  },
  {
    key: 'web/components/admin/growth/growth-dashboard.tsx#default',
    component: AdminGrowthGrowthDashboardDefault,
  },
  {
    key: 'web/components/admin/growth/kpi-cards.tsx#KpiCards',
    component: AdminGrowthKpiCardsKpiCards,
  },
  {
    key: 'web/components/admin/member-report-row.tsx#MemberReportRow',
    component: AdminMemberReportRowMemberReportRow,
  },
  {
    key: 'web/components/admin/moderation-analytics/moderation-analytics-dashboard.tsx#default',
    component: AdminModerationAnalyticsModerationAnalyticsDashboardDefault,
  },
  {
    key: 'web/components/admin/official-referral-links/official-referral-link-form.tsx#OfficialReferralLinkForm',
    component: AdminOfficialReferralLinksOfficialReferralLinkFormOfficialReferralLinkForm,
  },
  {
    key: 'web/components/admin/referral-link-validations/validation-form.tsx#ValidationForm',
    component: AdminReferralLinkValidationsValidationFormValidationForm,
  },
  {
    key: 'web/components/admin/referral-link-validations/validations-list-table.tsx#ValidationsListTable',
    component: AdminReferralLinkValidationsValidationsListTableValidationsListTable,
  },
  {
    key: 'web/components/admin/topics/create-topic-identity-fields.tsx#CreateTopicIdentityFields',
    component: AdminTopicsCreateTopicIdentityFieldsCreateTopicIdentityFields,
  },
  { key: 'web/components/app-sidebar.tsx#AppSidebar', component: AppSidebarAppSidebar },
  {
    key: 'web/components/app-sidebar/nav-section.tsx#AppSidebarNavGroup',
    component: AppSidebarNavSectionAppSidebarNavGroup,
  },
  {
    key: 'web/components/app-sidebar/simple-section.tsx#SimpleSidebarSection',
    component: AppSidebarSimpleSectionSimpleSidebarSection,
  },
  {
    key: 'web/components/appeals/appeal-dialog.tsx#AppealDialog',
    component: AppealsAppealDialogAppealDialog,
  },
  {
    key: 'web/components/appeals/appeal-form.tsx#AppealForm',
    component: AppealsAppealFormAppealForm,
  },
  { key: 'web/components/aside-drawer.tsx#AsideDrawer', component: AsideDrawerAsideDrawer },
] satisfies RatchetedComponent[]

const meta = {
  title: 'Coverage/Component Story Ratchet Part 1',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const CoveragePart1: Story = {
  parameters: componentStoryRatchetParameters,
  render: () => (
    <ComponentStoryRatchetGrid
      title='Component Story Ratchet Part 1'
      components={ratchetedComponentsPart1}
    />
  ),
}
