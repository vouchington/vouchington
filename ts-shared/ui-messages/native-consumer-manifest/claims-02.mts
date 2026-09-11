import type { NativeConsumerManifestEntry } from './types.mts'

/** Canonical native consumer claims, kept in code-point key order. */
export const NATIVE_CONSUMER_MANIFEST_CLAIMS_02 = [
  {
    key: 'extracted.my.friendRecommendationsList.connectYourFacebookXOrGithub_e3d61a65',
    consumers: ['dotnet'],
  },
  {
    key: 'extracted.my.friendRecommendationsList.noFriendRecommendationsAtThisTime_fb21db17',
    consumers: ['dotnet'],
  },
  {
    key: 'extracted.my.friendRecommendationsList.viaProviderlabel_3c6f79cf',
    consumers: ['dotnet'],
  },
  {
    key: 'extracted.my.pointValuationsManager.pleaseEnterAValidValuePerPoint_67b38bc3',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.my.preferencesForm.hackerNewsDiscussions_065664a4',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.my.preferencesForm.showRelatedHackerNewsThreadsWhen_00754911',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.my.rewardsProgramStatusesManager.sinceMustBeBeforeUntil_a4745364',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.my.spendingCategoriesManager.pleaseEnterAValidAmount_010f1dd6',
    consumers: ['swift', 'dotnet'],
  },
  {
    key: 'extracted.pointValuationsManager.addValuationForm.addAPointValuation_29ced576',
    consumers: ['swift'],
  },
  {
    key: 'extracted.pointValuationsManager.addValuationForm.add_9fd728c6',
    consumers: ['swift'],
  },
  {
    key: 'extracted.pointValuationsManager.addValuationForm.optionalNote_951ddd37',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.pointValuationsManager.addValuationForm.searchRewardsPrograms_990e4fa0',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.pointValuationsManager.addValuationForm.valuePerPoint_fa9d9f8a',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.pointValuationsManager.valuationList.cancel_19766ed6',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.pointValuationsManager.valuationList.optionalNote_951ddd37',
    consumers: ['swift'],
  },
  {
    key: 'extracted.pointValuationsManager.valuationList.save_1509f561',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.pointValuationsManager.valuationList.valuePerPoint_fa9d9f8a',
    consumers: ['swift'],
  },
  {
    key: 'extracted.pointValuationsManager.valuationSummary.cancel_19766ed6',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.pointValuationsManager.valuationSummary.confirm_eebdd24a',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.pointValuationsManager.valuationSummary.edit_464c4ffd',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.pointValuationsManager.valuationSummary.remove_9fe2f243',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.pointValuationsManager.valuationSummary.remove_c3812fc4',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.pointValuationsManager.valuationSummary.valuePerPoint_7111fb3c',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.rewardsProgramPointValuations.page.manageYourRewardsProgramPointValuations_e3bcc429',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.rewardsProgramPointValuations.page.pointValuations_f90821b2',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.rewardsProgramStatusesManager.addStatusForm.addARewardsProgramStatus_77e8d1de',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.rewardsProgramStatusesManager.addStatusForm.add_9fd728c6',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.rewardsProgramStatusesManager.addStatusForm.searchRewardsProgramStatuses_a9286328',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.rewardsProgramStatusesManager.statusList.cancel_19766ed6',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.rewardsProgramStatusesManager.statusList.save_1509f561',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.rewardsProgramStatusesManager.statusList.since_98af1ed6',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.rewardsProgramStatusesManager.statusList.until_7caf856e',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.rewardsProgramStatusesManager.statusSummary.cancel_19766ed6',
    consumers: ['dotnet', 'swift'],
  },
  {
    key: 'extracted.rewardsProgramStatusesManager.statusSummary.confirm_eebdd24a',
    consumers: ['dotnet', 'swift'],
  },
] as const satisfies readonly NativeConsumerManifestEntry[]
