import type { ClassifierGoldenFixture } from './classifier-golden-set.mts'
import { expectations, postClassifierKeys } from './classifier-golden-expectations.mts'

export const classifierPostGoldenFixtures4: readonly ClassifierGoldenFixture[] = [
  {
    id: 'synthetic-second-click-bait',
    subjectKind: 'post',
    candidateSlate: 'production-post-classifier-catalog',
    state:
      'Airlines hate this simple trick for free upgrades. Click to discover the one rule they never tell passengers.',
    rationale:
      'A second curiosity-driven teaser withholding its claim should be tagged as click-bait.',
    expected: expectations(
      postClassifierKeys,
      ['click-bait'],
      'The text does not meet this candidate definition.',
      'The text presents a sensational secret and asks readers to click for withheld information.',
    ),
  },
  {
    id: 'synthetic-second-vague-post',
    subjectKind: 'post',
    candidateSlate: 'production-post-classifier-catalog',
    state: 'Not sure what to do about everything lately. Maybe the first option is better?',
    rationale: 'A second context-free prompt should be tagged as vague-post.',
    expected: expectations(
      postClassifierKeys,
      ['vague-post'],
      'The text does not meet this candidate definition.',
      'The statement refers to undefined options and circumstances.',
    ),
  },
  {
    id: 'synthetic-second-shit-post',
    subjectKind: 'post',
    candidateSlate: 'production-post-classifier-catalog',
    state: 'My suitcase applied for a passport and came back as the mayor of Saturn.',
    rationale: 'A second deliberately absurd non sequitur should be tagged as shit-post.',
    expected: expectations(
      postClassifierKeys,
      ['shit-post'],
      'The text does not meet this candidate definition.',
      'The statement intentionally combines impossible events as an absurd joke.',
    ),
  },
  {
    id: 'synthetic-second-buying-request',
    subjectKind: 'post',
    candidateSlate: 'production-post-classifier-catalog',
    state: 'Does anyone have hotel points available to sell? I am ready to buy this week.',
    rationale: 'A second direct purchase request should be tagged as buying.',
    expected: expectations(
      postClassifierKeys,
      ['buying'],
      'The text does not meet this candidate definition.',
      'The author explicitly states they are ready to buy hotel points.',
    ),
  },
  {
    id: 'synthetic-second-trade-proposal',
    subjectKind: 'post',
    candidateSlate: 'production-post-classifier-catalog',
    state: 'Would trade my extra checked-bag voucher for a one-day airport lounge pass.',
    rationale: 'A second specific offer to exchange benefits should be tagged as trade.',
    expected: expectations(
      postClassifierKeys,
      ['trade'],
      'The text does not meet this candidate definition.',
      'The author proposes a direct exchange between two travel benefits.',
    ),
  },
]
