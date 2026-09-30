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
