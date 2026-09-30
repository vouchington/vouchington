import type { ClassifierGoldenFixture } from './classifier-golden-set.mts'
import { autotaggerCandidateSlate, expectations } from './classifier-golden-expectations.mts'

export const classifierAutotaggerGoldenFixtures2: readonly ClassifierGoldenFixture[] = [
  {
    id: 'synthetic-second-lounge-review',
    subjectKind: 'rss-feed-item',
    candidateSlate: autotaggerCandidateSlate,
    state:
      'A walkthrough of the terminal club covers its shower suites, buffet, and quiet work area near the departure gates.',
    rationale: 'A second review of airport lounge facilities should match airport lounges.',
    expected: expectations(
      autotaggerCandidateSlate,
      ['Airport lounges'],
      'The candidate is unrelated to this terminal-club review.',
      'The content reviews seating, food, and showers in an airport lounge.',
    ),
  },
  {
    id: 'synthetic-second-home-cooking',
    subjectKind: 'post',
    candidateSlate: autotaggerCandidateSlate,
    state:
      'To make vegetable soup at home, sauté onions, add carrots and broth, simmer until tender, then season before serving.',
    rationale: 'A second practical recipe should match home cooking.',
    expected: expectations(
      autotaggerCandidateSlate,
      ['Home cooking'],
      'The candidate is unrelated to this vegetable-soup recipe.',
      'The text gives step-by-step preparation instructions for a home-cooked meal.',
    ),
  },
  {
    id: 'synthetic-road-trip-itinerary',
    subjectKind: 'post',
    candidateSlate: autotaggerCandidateSlate,
    state:
      'We are driving from Portland to the coast, stopping at state parks and small towns, then camping overnight before heading home.',
    rationale: 'A multi-stop driving trip should match road trips.',
    expected: expectations(
      autotaggerCandidateSlate,
      ['Road trips'],
      'The candidate is unrelated to this driving itinerary.',
      'The text describes an extended journey by car with stops and an overnight stay.',
    ),
  },
  {
    id: 'synthetic-second-road-trip',
    subjectKind: 'post',
    candidateSlate: autotaggerCandidateSlate,
    state:
      'Planning a week-long drive through Utah: rent a car, visit the national parks, and stay in motels along the route.',
    rationale: 'A second extended driving itinerary should match road trips.',
    expected: expectations(
      autotaggerCandidateSlate,
      ['Road trips'],
      'The candidate is unrelated to this Utah driving itinerary.',
      'The text describes a route-based vacation by car with multiple destination stops.',
    ),
  },
]
