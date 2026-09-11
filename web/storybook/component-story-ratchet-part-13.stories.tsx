import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { componentStoryRatchetParameters } from './component-story-ratchet-parameters'
import {
  ComponentStoryRatchetGrid,
  type RatchetedComponent,
} from './component-story-ratchet-renderer'
import { TagItem as TagsTagItemTagItem } from '@/components/tags/tag-item'
import { TagList as TagsTagListTagList } from '@/components/tags/tag-list'
import { TopicCategoryTagsAside as TagsTopicCategoryTagsAsideTopicCategoryTagsAside } from '@/components/tags/topic-category-tags-aside'
import { TopicFaqPostsAsideContent as TagsTopicFaqPostsAsideContentTopicFaqPostsAsideContent } from '@/components/tags/topic-faq-posts-aside-content'
import { TopicPublisherTypesAside as TagsTopicPublisherTypesAsideTopicPublisherTypesAside } from '@/components/tags/topic-publisher-types-aside'
import { UrlEmbedRow as TagsUrlEmbedRowUrlEmbedRow } from '@/components/tags/url-embed-row'
import { ClaimTopicForm as TopicClaimsClaimTopicFormClaimTopicForm } from '@/components/topic-claims/claim-topic-form'
import { DomainTabs as TopicClaimsDomainTabsDomainTabs } from '@/components/topic-claims/domain-tabs'
import { DomainVerificationPanel as TopicClaimsDomainVerificationPanelDomainVerificationPanel } from '@/components/topic-claims/domain-verification-panel'
import {
  DnsInstructions as TopicClaimsVerificationTokenInstructionsDnsInstructions,
  WellKnownInstructions as TopicClaimsVerificationTokenInstructionsWellKnownInstructions,
} from '@/components/topic-claims/verification-token-instructions'
import { TopicRecommendationDialogFooter as TopicRecommendationsTopicRecommendationDialogFooterTopicRecommendationDialogFooter } from '@/components/topic-recommendations/topic-recommendation-dialog-footer'
import { TopicRecommendationDialogStatusInfo as TopicRecommendationsTopicRecommendationDialogStatusInfoTopicRecommendationDialogStatusInfo } from '@/components/topic-recommendations/topic-recommendation-dialog-status-info'
import { TopicRecommendationDuplicateCheck as TopicRecommendationsTopicRecommendationDuplicateCheckTopicRecommendationDuplicateCheck } from '@/components/topic-recommendations/topic-recommendation-duplicate-check'
import { TopicRecommendationFilters as TopicRecommendationsTopicRecommendationFiltersTopicRecommendationFilters } from '@/components/topic-recommendations/topic-recommendation-filters'
import { TopicRecommendationFormFields as TopicRecommendationsTopicRecommendationFormFieldsTopicRecommendationFormFields } from '@/components/topic-recommendations/topic-recommendation-form-fields'
import { TopicRecommendationsTableRow as TopicRecommendationsTopicRecommendationsTableRowTopicRecommendationsTableRow } from '@/components/topic-recommendations/topic-recommendations-table-row'
import { AliasesClient as TopicsAliasesAliasesClientAliasesClient } from '@/components/topics/aliases/aliases-client'

const ratchetedComponentsPart13 = [
  { key: 'web/components/tags/tag-item.tsx#TagItem', component: TagsTagItemTagItem },
  { key: 'web/components/tags/tag-list.tsx#TagList', component: TagsTagListTagList },
  {
    key: 'web/components/tags/topic-category-tags-aside.tsx#TopicCategoryTagsAside',
    component: TagsTopicCategoryTagsAsideTopicCategoryTagsAside,
  },
  {
    key: 'web/components/tags/topic-faq-posts-aside-content.tsx#TopicFaqPostsAsideContent',
    component: TagsTopicFaqPostsAsideContentTopicFaqPostsAsideContent,
  },
  {
    key: 'web/components/tags/topic-publisher-types-aside.tsx#TopicPublisherTypesAside',
    component: TagsTopicPublisherTypesAsideTopicPublisherTypesAside,
  },
  {
    key: 'web/components/tags/url-embed-row.tsx#UrlEmbedRow',
    component: TagsUrlEmbedRowUrlEmbedRow,
  },
  {
    key: 'web/components/topic-claims/claim-topic-form.tsx#ClaimTopicForm',
    component: TopicClaimsClaimTopicFormClaimTopicForm,
  },
  {
    key: 'web/components/topic-claims/domain-tabs.tsx#DomainTabs',
    component: TopicClaimsDomainTabsDomainTabs,
  },
  {
    key: 'web/components/topic-claims/domain-verification-panel.tsx#DomainVerificationPanel',
    component: TopicClaimsDomainVerificationPanelDomainVerificationPanel,
  },
  {
    key: 'web/components/topic-claims/verification-token-instructions.tsx#DnsInstructions',
    component: TopicClaimsVerificationTokenInstructionsDnsInstructions,
  },
  {
    key: 'web/components/topic-claims/verification-token-instructions.tsx#WellKnownInstructions',
    component: TopicClaimsVerificationTokenInstructionsWellKnownInstructions,
  },
  {
    key: 'web/components/topic-recommendations/topic-recommendation-dialog-footer.tsx#TopicRecommendationDialogFooter',
    component: TopicRecommendationsTopicRecommendationDialogFooterTopicRecommendationDialogFooter,
  },
  {
    key: 'web/components/topic-recommendations/topic-recommendation-dialog-status-info.tsx#TopicRecommendationDialogStatusInfo',
    component:
      TopicRecommendationsTopicRecommendationDialogStatusInfoTopicRecommendationDialogStatusInfo,
  },
  {
    key: 'web/components/topic-recommendations/topic-recommendation-duplicate-check.tsx#TopicRecommendationDuplicateCheck',
    component:
      TopicRecommendationsTopicRecommendationDuplicateCheckTopicRecommendationDuplicateCheck,
  },
  {
    key: 'web/components/topic-recommendations/topic-recommendation-filters.tsx#TopicRecommendationFilters',
    component: TopicRecommendationsTopicRecommendationFiltersTopicRecommendationFilters,
  },
  {
    key: 'web/components/topic-recommendations/topic-recommendation-form-fields.tsx#TopicRecommendationFormFields',
    component: TopicRecommendationsTopicRecommendationFormFieldsTopicRecommendationFormFields,
  },
  {
    key: 'web/components/topic-recommendations/topic-recommendations-table-row.tsx#TopicRecommendationsTableRow',
    component: TopicRecommendationsTopicRecommendationsTableRowTopicRecommendationsTableRow,
  },
  {
    key: 'web/components/topics/aliases/aliases-client.tsx#AliasesClient',
    component: TopicsAliasesAliasesClientAliasesClient,
  },
] satisfies RatchetedComponent[]

const meta = {
  title: 'Coverage/Component Story Ratchet Part 13',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const CoveragePart13: Story = {
  parameters: componentStoryRatchetParameters,
  render: () => (
    <ComponentStoryRatchetGrid
      title='Component Story Ratchet Part 13'
      components={ratchetedComponentsPart13}
    />
  ),
}
