import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const ci = readFileSync('.github/ci-path-filters.yml', 'utf8')
const staticAnalysis = readFileSync('.github/workflows/static-code-analysis.yml', 'utf8')

describe('native localization CI', () => {
  it('validates the producer catalog directly without requiring an external consumer checkout', () => {
    expect(staticAnalysis).toContain('name: Check native localization resources')
    expect(staticAnalysis).toContain('run: node dev/native-localization.mts --validate')
    expect(staticAnalysis).not.toContain('pnpm run native-localization:check')
  })

  it('keeps the producer inputs on CI filters without claiming external consumer ownership', () => {
    for (const path of ['ts-shared/**', 'dev/**', 'static-code-analysis/**']) {
      expect(ci).toContain(`- '${path}'`)
    }
    expect(ci).not.toContain('swift-clients:')
    expect(ci).not.toContain('dotnet-clients:')
  })
})
