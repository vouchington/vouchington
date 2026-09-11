import type { Translator } from '@ts-shared/ui-messages'

export interface FaqItem {
  question: string
  answer: string
}

export function getPlanFaqItems(t: Translator): FaqItem[] {
  return [
    {
      question: t('extracted.memberships.planFaqItems.canIChangePlansLater_3f7a91c4'),
      answer: t('extracted.memberships.planFaqItems.yesYouCanUpgradeOrDowngrade_8b2e04d7'),
    },
    {
      question: t('extracted.memberships.planFaqItems.whatHappensWhenICancel_1c94af62'),
      answer: t('extracted.memberships.planFaqItems.youKeepFullAccessUntil_5e8d372a'),
    },
    {
      question: t('extracted.memberships.planFaqItems.whyDoFreeAccountsHave7DayWait_a4f19c08'),
      answer: t('extracted.memberships.planFaqItems.theWaitMakesAutomatedAbuseMore_6d3f28e1'),
    },
    {
      question: t('extracted.memberships.planFaqItems.doINeedAPaidPlanToUse_4f8a1d26'),
      answer: t('extracted.memberships.planFaqItems.noAnySignedInAccountWithA_b91e4a73'),
    },
    {
      question: t('extracted.memberships.planFaqItems.whatAreAiModerationRules_2c6f819d'),
      answer: t('extracted.memberships.planFaqItems.aiModerationRulesLetYouConfigure_7a3d05e8'),
    },
  ]
}
