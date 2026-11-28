import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const COMMAND = 'jscpd .'
const CI_COMMAND = `pnpm exec ${COMMAND}`
const DEAD_CODE_COMMAND = 'pnpm run jscpd:dead-code'

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

  it('wires the separate dead-code baseline guard through lint, CI, and ci-local', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(packageJson.scripts.lint).toContain(DEAD_CODE_COMMAND)
    expect(readFileSync('.github/workflows/static-code-analysis.yml', 'utf8')).toContain(
      `run: ${DEAD_CODE_COMMAND}\n`,
    )
    expect(readFileSync('ci/ci-local/static-commands.mts', 'utf8')).toContain(
      `'${DEAD_CODE_COMMAND}'`,
    )
  })
})
