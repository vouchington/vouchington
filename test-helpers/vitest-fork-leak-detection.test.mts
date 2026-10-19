import { describe, expect, it } from 'vitest'
import { formatForkLeakDiagnostics } from './vitest-fork-leak-diagnostics.mts'
import { getForkLeakDetector } from './vitest-fork-leak-detection.mts'

describe('getForkLeakDetector', () => {
  it('returns the same detector instance on repeated calls within a process', () => {
    const first = getForkLeakDetector()
    const second = getForkLeakDetector()

    expect(second).toBe(first)
  })
})

describe('formatForkLeakDiagnostics', () => {
  it('renders the verdict, tracked counts, and unavailable PostgreSQL pool context', () => {
    const counts = new Map<string, number>([
      ['PipeWrap', 8],
      ['TCPSocketWrap', 14],
      ['Timeout', 1],
    ])

    expect(
      formatForkLeakDiagnostics(
        {
          type: 'TCPSocketWrap',
          baseline: 5,
          current: 14,
          streak: 5,
          growthCheckpoints: 4,
          requiredGrowthCheckpoints: 4,
          detectedInFile: 'bystander.test.mts',
          suspectedGrowth: {
            testFile: 'source.test.mts',
            previous: 8,
            current: 14,
            delta: 6,
          },
        },
        counts,
      ),
    ).toBe(
      [
        '[vitest-fork-leak]',
        'type: TCPSocketWrap',
        'baseline: 5',
        'current: 14 (+9)',
        'candidate evidence span: 5',
        'candidate growth evidence: 4 (required: 4)',
        'confirmed by continuation in file: bystander.test.mts',
        'suspected growth file: source.test.mts',
        'largest growth step: 8 -> 14 (+6)',
        'tracked resource counts: PipeWrap=8 TCPSocketWrap=14 Timeout=1',
        'PostgreSQL pool metrics: unavailable (pools not initialized)',
      ].join('\n'),
    )
  })
})
