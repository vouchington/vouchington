import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateDeadCodeConfig } from './dead-code-scope.mts'

const config = JSON.parse(readFileSync('.jscpd.json', 'utf8')) as Record<string, unknown>

describe('jscpd dead-code scan scope', () => {
  it('accepts the reviewed entry roots and analyzer options', () => {
    expect(validateDeadCodeConfig(config)).toHaveLength(29)
  })

  it('rejects roots or settings that could hide findings during a baseline update', () => {
    const original = config['deadCode'] as Record<string, unknown>
    const invalid = [
      { ...config, deadCode: { ...original, entry: ['**/*.mts'] } },
      { ...config, deadCode: { ...original, categories: ['unused-file'] } },
      { ...config, deadCode: { ...original, minConfidence: 90 } },
      { ...config, deadCode: { ...original, includeTests: true } },
      { ...config, deadCode: { ...original, includeEntryExports: true } },
      { ...config, deadCode: { ...original, enabled: false } },
      { ...config, ignore: ['**/*'] },
      { ...config, format: ['sql'] },
      { ...config, path: 'src' },
    ]
    for (const changed of invalid) {
      expect(() => validateDeadCodeConfig(changed)).toThrow('scope changed')
    }
  })
})
