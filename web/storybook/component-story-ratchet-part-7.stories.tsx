import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { componentStoryRatchetParameters } from './component-story-ratchet-parameters'
import {
  ComponentStoryRatchetGrid,
  type RatchetedComponent,
} from './component-story-ratchet-renderer'
import { LandingPageItemEditor as MyLandingPagesManagerItemPickerLandingPageItemEditor } from '@/components/my/landing-pages-manager/item-picker'
import { LinkFields as MyLandingPagesManagerItemPickerAddTypeLinkFields } from '@/components/my/landing-pages-manager/item-picker-add-type'
import {
  CandidateSelect as MyLandingPagesManagerItemPickerFieldsCandidateSelect,
  TopicGroupOptions as MyLandingPagesManagerItemPickerFieldsTopicGroupOptions,
  TopicSelect as MyLandingPagesManagerItemPickerFieldsTopicSelect,
} from '@/components/my/landing-pages-manager/item-picker-fields'
import {
  CreatePageForm as MyLandingPagesManagerPageFormsCreatePageForm,
  PageDetailsForm as MyLandingPagesManagerPageFormsPageDetailsForm,
} from '@/components/my/landing-pages-manager/page-forms'
import { PageList as MyLandingPagesManagerPageListPageList } from '@/components/my/landing-pages-manager/page-list'
import { MfaReauthDialog as MyMfaReauthDialogMfaReauthDialog } from '@/components/my/mfa-reauth-dialog'
import { PasskeyManager as MyPasskeyManagerPasskeyManager } from '@/components/my/passkey-manager'
import { AddPasskeyForm as MyPasskeyManagerAddPasskeyFormAddPasskeyForm } from '@/components/my/passkey-manager/add-passkey-form'
import { PasskeyList as MyPasskeyManagerPasskeyListPasskeyList } from '@/components/my/passkey-manager/passkey-list'
import { AddValuationForm as MyPointValuationsManagerAddValuationFormAddValuationForm } from '@/components/my/point-valuations-manager/add-valuation-form'
import { ValuationList as MyPointValuationsManagerValuationListValuationList } from '@/components/my/point-valuations-manager/valuation-list'
import { ValuationSummary as MyPointValuationsManagerValuationSummaryValuationSummary } from '@/components/my/point-valuations-manager/valuation-summary'
import { ProfileForm as MyProfileFormProfileForm } from '@/components/my/profile-form'
import { ReferralClicksPage as MyReferralClicksPageReferralClicksPage } from '@/components/my/referral-clicks-page'
import { AddReferralLink as MyReferralLinksManagerAddReferralLinkAddReferralLink } from '@/components/my/referral-links-manager/add-referral-link'

const ratchetedComponentsPart7 = [
  {
    key: 'web/components/my/landing-pages-manager/item-picker-add-type.tsx#LinkFields',
    component: MyLandingPagesManagerItemPickerAddTypeLinkFields,
  },
  {
    key: 'web/components/my/landing-pages-manager/item-picker-fields.tsx#CandidateSelect',
    component: MyLandingPagesManagerItemPickerFieldsCandidateSelect,
  },
  {
    key: 'web/components/my/landing-pages-manager/item-picker-fields.tsx#TopicGroupOptions',
    component: MyLandingPagesManagerItemPickerFieldsTopicGroupOptions,
  },
  {
    key: 'web/components/my/landing-pages-manager/item-picker-fields.tsx#TopicSelect',
    component: MyLandingPagesManagerItemPickerFieldsTopicSelect,
  },
  {
    key: 'web/components/my/landing-pages-manager/item-picker.tsx#LandingPageItemEditor',
    component: MyLandingPagesManagerItemPickerLandingPageItemEditor,
  },
  {
    key: 'web/components/my/landing-pages-manager/page-forms.tsx#CreatePageForm',
    component: MyLandingPagesManagerPageFormsCreatePageForm,
  },
  {
    key: 'web/components/my/landing-pages-manager/page-forms.tsx#PageDetailsForm',
    component: MyLandingPagesManagerPageFormsPageDetailsForm,
  },
  {
    key: 'web/components/my/landing-pages-manager/page-list.tsx#PageList',
    component: MyLandingPagesManagerPageListPageList,
  },
  {
    key: 'web/components/my/mfa-reauth-dialog.tsx#MfaReauthDialog',
    component: MyMfaReauthDialogMfaReauthDialog,
  },
  {
    key: 'web/components/my/passkey-manager.tsx#PasskeyManager',
    component: MyPasskeyManagerPasskeyManager,
  },
  {
    key: 'web/components/my/passkey-manager/add-passkey-form.tsx#AddPasskeyForm',
    component: MyPasskeyManagerAddPasskeyFormAddPasskeyForm,
  },
  {
    key: 'web/components/my/passkey-manager/passkey-list.tsx#PasskeyList',
    component: MyPasskeyManagerPasskeyListPasskeyList,
  },
  {
    key: 'web/components/my/point-valuations-manager/add-valuation-form.tsx#AddValuationForm',
    component: MyPointValuationsManagerAddValuationFormAddValuationForm,
  },
  {
    key: 'web/components/my/point-valuations-manager/valuation-list.tsx#ValuationList',
    component: MyPointValuationsManagerValuationListValuationList,
  },
  {
    key: 'web/components/my/point-valuations-manager/valuation-summary.tsx#ValuationSummary',
    component: MyPointValuationsManagerValuationSummaryValuationSummary,
  },
  { key: 'web/components/my/profile-form.tsx#ProfileForm', component: MyProfileFormProfileForm },
  {
    key: 'web/components/my/referral-clicks-page.tsx#ReferralClicksPage',
    component: MyReferralClicksPageReferralClicksPage,
  },
  {
    key: 'web/components/my/referral-links-manager/add-referral-link.tsx#AddReferralLink',
    component: MyReferralLinksManagerAddReferralLinkAddReferralLink,
  },
] satisfies RatchetedComponent[]

const meta = {
  title: 'Coverage/Component Story Ratchet Part 7',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const CoveragePart7: Story = {
  parameters: componentStoryRatchetParameters,
  render: () => (
    <ComponentStoryRatchetGrid
      title='Component Story Ratchet Part 7'
      components={ratchetedComponentsPart7}
    />
  ),
}
