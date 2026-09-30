import type { ClassifierGoldenFixture } from './classifier-golden-set.mts'
import { expectations, postClassifierKeys } from './classifier-golden-expectations.mts'

export const classifierPostGoldenFixtures3: readonly ClassifierGoldenFixture[] = [
  {
    id: 'synthetic-election-policy-appeal',
    subjectKind: 'post',
    candidateSlate: 'production-post-classifier-catalog',
    state:
      'Please vote yes on the city measure funding the new rail connection to the airport. The election is Tuesday.',
    rationale: 'An explicit appeal about an election measure should be tagged as political.',
    expected: expectations(
      postClassifierKeys,
      ['political'],
      'The text does not meet this candidate definition.',
      'The author urges a vote on a named public policy measure.',
    ),
  },
  {
    id: 'synthetic-sensational-route-headline',
    subjectKind: 'post',
    candidateSlate: 'production-post-classifier-catalog',
    state:
      'This one secret airport trick changes everything!!! You will not believe what happened when I boarded.',
    rationale: 'Sensational teaser language withholding the point should be tagged as click-bait.',
    expected: expectations(
      postClassifierKeys,
      ['click-bait'],
      'The text does not meet this candidate definition.',
      'The headline uses exaggerated curiosity hooks while withholding its subject.',
    ),
  },
  {
    id: 'synthetic-unspecified-itinerary-question',
    subjectKind: 'post',
    candidateSlate: 'production-post-classifier-catalog',
    state: 'Thoughts on this? Is it worth it, or should I just do the other thing instead?',
    rationale:
      'A post without enough context to identify its subject should be tagged as vague-post.',
    expected: expectations(
      postClassifierKeys,
      ['vague-post'],
      'The text does not meet this candidate definition.',
      'The post gives no identifiable subject, option, or context for its question.',
    ),
  },
  {
    id: 'synthetic-nonsensical-airport-post',
    subjectKind: 'post',
    candidateSlate: 'production-post-classifier-catalog',
    state: 'Boarding group seven just challenged the moon to a duel with a plastic spoon.',
    rationale: 'An intentionally absurd non sequitur should be tagged as shit-post.',
    expected: expectations(
      postClassifierKeys,
      ['shit-post'],
      'The text does not meet this candidate definition.',
      'The sentence is an intentionally nonsensical non sequitur.',
    ),
  },
  {
    id: 'synthetic-hiring-expansion',
    subjectKind: 'post',
    candidateSlate: 'production-post-classifier-catalog',
    state:
      'We are adding a second award-travel advisor and would like to hire someone with points-booking experience. Send a resume by Friday.',
    rationale: 'A second direct employment notice should be tagged as hiring.',
    expected: expectations(
      postClassifierKeys,
      ['hiring'],
      'The text does not meet this candidate definition.',
      'The author states they want to hire an advisor and requests resumes.',
    ),
  },
]
