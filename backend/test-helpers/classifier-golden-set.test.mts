import { describe, expect, it } from 'vitest'
import {
  autotaggerGoldenFixtures,
  postClassifierGoldenFixtures,
} from './classifier-golden-fixtures.mts'
import {
  classifierGoldenBatchId,
  missingOrDuplicateClassifierGoldenResults,
  unexpectedClassifierGoldenBand,
  type ClassifierGoldenFixture,
} from './classifier-golden-set.mts'

describe('classifier golden band regression', () => {
  it('keeps minimum fixture and independent positive coverage for every candidate', () => {
    for (const fixtures of [postClassifierGoldenFixtures, autotaggerGoldenFixtures]) {
      const candidateKeys = Object.keys(fixtures[0]!.expected)
      expect(new Set(fixtures.map(fixture => fixture.id)).size).toBe(fixtures.length)
      expect(fixtures.length).toBeGreaterThanOrEqual(3)
      for (const key of candidateKeys) {
        expect(fixtures.every(fixture => key in fixture.expected)).toBe(true)
        expect(
          fixtures.filter(fixture =>
            fixture.expected[key]!.acceptableBands.includes('at-or-above-upper'),
          ).length,
        ).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('accepts an upper-threshold self-promotion score for overlapping hiring and for-hire posts', () => {
    const overlapping = ['synthetic-travel-writer-opening', 'synthetic-travel-content-job-seeker']
    const fixtures = postClassifierGoldenFixtures.filter(fixture =>
      overlapping.includes(fixture.id),
    )
    expect(fixtures.map(fixture => fixture.id)).toEqual(overlapping)
    const selfPromotion = {
      key: 'self-promotion',
      thresholdRevision: 'post-classifier-default-upper',
      thresholds: { lower: 0.25, upper: 0.75 },
    }
    for (const fixture of fixtures) {
      expect(fixture.expected['self-promotion']?.acceptableBands).toEqual([
        'at-or-above-upper',
        'between',
      ])
      expect(unexpectedClassifierGoldenBand(fixture, selfPromotion, 0.75)).toBeNull()
      expect(unexpectedClassifierGoldenBand(fixture, selfPromotion, 0.79)).toBeNull()
      expect(unexpectedClassifierGoldenBand(fixture, selfPromotion, 0.2)).toContain(
        'expected at-or-above-upper|between, received below-lower',
      )
    }
  })

  it('accepts an upper-threshold selling score for overlapping for-hire travel-service offers', () => {
    const overlapping = ['synthetic-award-booking-help-offer', 'synthetic-second-for-hire-offer']
    const fixtures = postClassifierGoldenFixtures.filter(fixture =>
      overlapping.includes(fixture.id),
    )
    expect(fixtures.map(fixture => fixture.id)).toEqual(overlapping)
    const selling = {
      key: 'selling',
      thresholdRevision: 'post-classifier-default-upper',
      thresholds: { lower: 0.25, upper: 0.75 },
    }
    for (const fixture of fixtures) {
      expect(fixture.expected.selling?.acceptableBands).toEqual(['at-or-above-upper', 'between'])
      expect(unexpectedClassifierGoldenBand(fixture, selling, 0.75)).toBeNull()
      expect(unexpectedClassifierGoldenBand(fixture, selling, 0.78)).toBeNull()
      expect(unexpectedClassifierGoldenBand(fixture, selling, 0.85)).toBeNull()
      expect(unexpectedClassifierGoldenBand(fixture, selling, 0.87)).toBeNull()
      expect(unexpectedClassifierGoldenBand(fixture, selling, 0.2)).toContain(
        'expected at-or-above-upper|between, received below-lower',
      )
    }
  })

  it('creates valid UUIDv7 batch identities for non-persisting prepared calls', () => {
    expect(classifierGoldenBatchId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('reports a fixture when a changed threshold moves its decision into another band', () => {
    const fixture: ClassifierGoldenFixture = {
      id: 'synthetic-threshold-flip',
      subjectKind: 'post',
      state: 'Synthetic text.',
      candidateSlate: ['synthetic-candidate'],
      rationale: 'A focused threshold-boundary contract check.',
      expected: {
        candidate: {
          acceptableBands: ['below-lower'],
          rationale: 'This baseline expects a low decision.',
        },
      },
    }
    const candidate = {
      key: 'candidate',
      thresholdRevision: 'threshold-revision-2',
      thresholds: { lower: 0.15, upper: 0.75 },
    }

    expect(unexpectedClassifierGoldenBand(fixture, candidate, 0.2)).toContain(
      'synthetic-threshold-flip candidate candidate threshold threshold-revision-2',
    )
    expect(unexpectedClassifierGoldenBand(fixture, candidate, 0.2)).toContain(
      'expected below-lower, received between',
    )
    expect(
      unexpectedClassifierGoldenBand(
        fixture,
        {
          ...candidate,
          thresholds: { lower: 0.25, upper: 0.75 },
        },
        0.2,
      ),
    ).toBeNull()
  })

  it('does not let omitted or duplicate candidate results disappear from a fixture', () => {
    expect(
      missingOrDuplicateClassifierGoldenResults(
        'synthetic-completeness-check',
        ['candidate-a', 'candidate-b'],
        ['candidate-a', 'candidate-a'],
      ),
    ).toEqual([
      'synthetic-completeness-check: expected exactly one result for candidate candidate-a, received 2',
      'synthetic-completeness-check: expected exactly one result for candidate candidate-b, received 0',
    ])
  })
})
