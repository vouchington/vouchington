import type { ClassifierGoldenFixture } from './classifier-golden-set.mts'
import { expectations, postClassifierKeys } from './classifier-golden-expectations.mts'

export const classifierPostGoldenFixtures1: readonly ClassifierGoldenFixture[] = [
  {
    id: 'synthetic-selling-mileage',
    subjectKind: 'post',
    candidateSlate: 'production-post-classifier-catalog',
    state:
      'I have 80,000 airline miles available and would like to sell them. Message me for the price and transfer details.',
    rationale: 'Directly offering miles for sale should be tagged as selling.',
    expected: expectations(
      postClassifierKeys,
      ['selling'],
      'The text does not meet this candidate definition.',
      'The text explicitly offers the named marketplace action.',
    ),
  },
  {
    id: 'synthetic-airline-referral-promotion',
    subjectKind: 'post',
    candidateSlate: 'production-post-classifier-catalog',
    state:
      'I built a travel-planning service for award flights. Use my referral link to subscribe and follow my channel for weekly tips.',
    rationale:
      'An author promoting their own service and channel should be tagged as self-promotion.',
    expected: expectations(
      postClassifierKeys,
      ['self-promotion'],
      'The text does not meet this candidate definition.',
      'The author explicitly promotes their own service and channel.',
    ),
  },
  {
    id: 'synthetic-partisan-campaign-claim',
    subjectKind: 'post',
    candidateSlate: 'production-post-classifier-catalog',
    state:
      'Vote for Jordan Lee this November. Their campaign says the new airport terminal will cut ticket prices in half for every traveler.',
    rationale:
      'A direct campaign appeal and unsupported universal political claim should be tagged as political.',
    expected: expectations(
      postClassifierKeys,
      ['political'],
      'The text does not meet this candidate definition.',
      'The text advocates for a named candidate and repeats an unsupported campaign claim.',
    ),
  },
  {
    id: 'synthetic-second-selling-offer',
    subjectKind: 'post',
    candidateSlate: 'production-post-classifier-catalog',
    state:
      'Selling 45,000 hotel points today. I can transfer them to your account after payment; send an offer if interested.',
    rationale: 'A second direct sale offer should remain tagged as selling.',
    expected: expectations(
      postClassifierKeys,
      ['selling'],
      'The text does not meet this candidate definition.',
      'The author offers a specific loyalty currency for payment and transfer.',
    ),
  },
  {
    id: 'synthetic-second-self-promotion',
    subjectKind: 'post',
    candidateSlate: 'production-post-classifier-catalog',
    state:
      'I launched my own award-search newsletter. Subscribe through my profile and use my code for the first month.',
    rationale:
      'A distinct promotion of the author’s own product should be tagged as self-promotion.',
    expected: expectations(
      postClassifierKeys,
      ['self-promotion'],
      'The text does not meet this candidate definition.',
      'The author promotes their own newsletter and subscription code.',
    ),
  },
]
