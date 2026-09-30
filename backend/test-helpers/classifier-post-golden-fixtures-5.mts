import type { ClassifierGoldenFixture } from './classifier-golden-set.mts'
import { expectations, postClassifierKeys } from './classifier-golden-expectations.mts'

export const classifierPostGoldenFixtures5: readonly ClassifierGoldenFixture[] = [
  {
    id: 'synthetic-second-for-hire-offer',
    subjectKind: 'post',
    candidateSlate: 'production-post-classifier-catalog',
    state:
      'Need someone to organize a complex award itinerary? I take paid clients and can start planning next week.',
    rationale: 'A second paid-service offer should be tagged as for-hire.',
    expected: expectations(
      postClassifierKeys,
      ['for-hire'],
      'The text does not meet this candidate definition.',
      'The author offers to serve paid travel-planning clients.',
    ),
  },
  {
    id: 'synthetic-second-political-appeal',
    subjectKind: 'post',
    candidateSlate: 'production-post-classifier-catalog',
    state:
      'Support the incumbent mayor in the upcoming election. Their plan calls for a new airport transit line.',
    rationale: 'A second electoral endorsement should be tagged as political.',
    expected: expectations(
      postClassifierKeys,
      ['political'],
      'The text does not meet this candidate definition.',
      'The author endorses a named public official in an upcoming election.',
    ),
  },
]
