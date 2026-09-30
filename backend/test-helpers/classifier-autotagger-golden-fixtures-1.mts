import type { ClassifierGoldenFixture } from './classifier-golden-set.mts'
import { autotaggerCandidateSlate, expectations } from './classifier-golden-expectations.mts'

export const classifierAutotaggerGoldenFixtures1: readonly ClassifierGoldenFixture[] = [
  {
    id: 'synthetic-award-ticket-planning',
    subjectKind: 'post',
    candidateSlate: autotaggerCandidateSlate,
    state:
      'I transferred credit-card points to an airline program and booked an award ticket for two people using miles.',
    rationale: 'A points transfer and mileage award booking match airline loyalty programs.',
    expected: expectations(
      autotaggerCandidateSlate,
      ['Airline loyalty programs'],
      'The candidate is unrelated to this award-ticket planning text.',
      'The text directly describes a points transfer and mileage award booking.',
    ),
  },
  {
    id: 'synthetic-airport-lounge-review',
    subjectKind: 'rss-feed-item',
    candidateSlate: autotaggerCandidateSlate,
    state:
      'The airport lounge has quiet seating, showers, and hot meals. This review compares the lounge before an evening departure.',
    rationale: 'A review of airport lounge facilities matches airport lounges.',
    expected: expectations(
      autotaggerCandidateSlate,
      ['Airport lounges'],
      'The candidate is unrelated to this airport lounge review.',
      'The text is specifically about facilities and a review of an airport lounge.',
    ),
  },
  {
    id: 'synthetic-sourdough-recipe',
    subjectKind: 'post',
    candidateSlate: autotaggerCandidateSlate,
    state:
      'For a sourdough loaf, mix flour, water, and starter, let the dough rise overnight, then bake it in a covered pot.',
    rationale: 'A concrete bread recipe matches home cooking.',
    expected: expectations(
      autotaggerCandidateSlate,
      ['Home cooking'],
      'The candidate is unrelated to this bread recipe.',
      'The text gives practical instructions for preparing a loaf at home.',
    ),
  },
  {
    id: 'synthetic-second-mileage-award',
    subjectKind: 'post',
    candidateSlate: autotaggerCandidateSlate,
    state:
      'I moved bank reward points to an airline and redeemed the miles for a round-trip award ticket.',
    rationale: 'A second transfer and award booking example should match airline loyalty programs.',
    expected: expectations(
      autotaggerCandidateSlate,
      ['Airline loyalty programs'],
      'The candidate is unrelated to this transfer and award-booking text.',
      'The text directly describes transferring points and redeeming miles for travel.',
    ),
  },
]
