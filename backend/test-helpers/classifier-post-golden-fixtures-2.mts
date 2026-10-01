import type { ClassifierGoldenFixture } from './classifier-golden-set.mts'
import { expectations, postClassifierKeys } from './classifier-golden-expectations.mts'

export const classifierPostGoldenFixtures2: readonly ClassifierGoldenFixture[] = [
  {
    id: 'synthetic-mileage-purchase-request',
    subjectKind: 'post',
    candidateSlate: 'production-post-classifier-catalog',
    state:
      'Looking to buy 30,000 airline miles. Please message me with your price and transfer options.',
    rationale: 'A direct request to purchase miles should be tagged as buying.',
    expected: expectations(
      postClassifierKeys,
      ['buying'],
      'The text does not meet this candidate definition.',
      'The author explicitly seeks to purchase a specified quantity of miles.',
    ),
  },
  {
    id: 'synthetic-award-seat-exchange',
    subjectKind: 'post',
    candidateSlate: 'production-post-classifier-catalog',
    state:
      'I can exchange two lounge passes for an upgrade certificate. Let me know if you want to trade.',
    rationale: 'An explicit exchange of travel benefits should be tagged as trade.',
    expected: expectations(
      postClassifierKeys,
      ['trade'],
      'The text does not meet this candidate definition.',
      'The author proposes exchanging one travel benefit for another.',
    ),
  },
  {
    id: 'synthetic-award-booking-help-offer',
    subjectKind: 'post',
    candidateSlate: 'production-post-classifier-catalog',
    state:
      'I am available to help book award flights for a fee. Send me your dates and I will quote the service.',
    rationale:
      'The author offers paid award-booking travel services and promotes that service, matching selling, for-hire, and self-promotion.',
    expected: expectations(
      postClassifierKeys,
      ['selling', 'for-hire', 'self-promotion'],
      'The text does not meet this candidate definition.',
      'The author offers to sell award-booking travel services and promotes that service.',
    ),
  },
  {
    id: 'synthetic-travel-writer-opening',
    subjectKind: 'post',
    candidateSlate: 'production-post-classifier-catalog',
    state:
      'Our travel publication is hiring a writer to cover airline loyalty programs. Apply with two published samples and your availability.',
    rationale:
      "A hiring notice for the author's own travel publication matches hiring and self-promotion.",
    expected: expectations(
      postClassifierKeys,
      ['hiring', 'self-promotion'],
      'The text does not meet this candidate definition.',
      'The author recruits for their own publication and promotes that publication.',
    ),
  },
  {
    id: 'synthetic-travel-content-job-seeker',
    subjectKind: 'post',
    candidateSlate: 'production-post-classifier-catalog',
    state:
      'Travel writer seeking a role creating guides to airline miles and hotel points. I can share my portfolio and start this month.',
    rationale:
      'A writer seeking paid work and offering a portfolio matches for-hire and self-promotion.',
    expected: expectations(
      postClassifierKeys,
      ['for-hire', 'self-promotion'],
      'The text does not meet this candidate definition.',
      'The author seeks paid work and promotes their own portfolio.',
    ),
  },
]
