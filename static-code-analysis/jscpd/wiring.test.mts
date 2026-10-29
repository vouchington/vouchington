import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const COMMAND = 'jscpd .'
const CI_COMMAND = `pnpm exec ${COMMAND}`
const DEAD_CODE_COMMAND = 'pnpm run jscpd:dead-code'
const config = JSON.parse(readFileSync('.jscpd.json', 'utf8')) as {
  exitCode: number
  deadCode?: { categories: string[]; minConfidence: number }
}

describe('jscpd wiring', () => {
  it('makes package, lint, workflow, and ci-local callers invoke the same command', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(packageJson.scripts.jscpd).toBe(COMMAND)
    expect(packageJson.scripts.lint).toContain('pnpm run jscpd')
    expect(readFileSync('.github/workflows/static-code-analysis.yml', 'utf8')).toContain(
      `run: ${CI_COMMAND}\n`,
    )
    expect(readFileSync('ci/ci-local/static-commands.mts', 'utf8')).toContain(`'${CI_COMMAND}'`)
  })

  it('fails the run on detected clones', () => {
    expect(config.exitCode).toBe(1)
  })

  it('wires the separate dead-code baseline guard through lint, CI, and ci-local', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(packageJson.scripts['jscpd:dead-code']).toBe(
      "vouchington dead-code --baseline static-code-analysis/jscpd/dead-code-baseline.json --exclude 'web/storybook/**' --exclude '**/test-helpers/**' --exclude '**/__tests__/**' --exclude '**/integration-tests/**'",
    )
    expect(packageJson.scripts['jscpd:dead-code:update']).toBe(
      "vouchington dead-code --baseline static-code-analysis/jscpd/dead-code-baseline.json --exclude 'web/storybook/**' --exclude '**/test-helpers/**' --exclude '**/__tests__/**' --exclude '**/integration-tests/**' --update",
    )
    expect(packageJson.scripts.lint).toContain(DEAD_CODE_COMMAND)
    expect(readFileSync('.github/workflows/static-code-analysis.yml', 'utf8')).toContain(
      `run: ${DEAD_CODE_COMMAND}\n`,
    )
    expect(readFileSync('ci/ci-local/static-commands.mts', 'utf8')).toContain(
      `'${DEAD_CODE_COMMAND}'`,
    )
    expect(config.deadCode?.categories).toEqual([
      'unused-file',
      'unused-export',
      'unused-symbol',
      'unused-import',
      'unused-member',
    ])
    expect(config.deadCode?.minConfidence).toBe(70)
  })
})
