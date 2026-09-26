import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const COMMAND = 'jscpd .'
const CI_COMMAND = `pnpm exec ${COMMAND}`
const README = readFileSync('static-code-analysis/jscpd/README.md', 'utf8')
const config = JSON.parse(readFileSync('.jscpd.json', 'utf8')) as {
  minLines: number
  exitCode: number
  ignore: string[]
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
    expect(readFileSync('ci/ci-local/targets.mts', 'utf8')).toContain(`'${CI_COMMAND}'`)
  })

  it('fails the run on any clone at or above the documented minLines threshold', () => {
    expect(config.exitCode).toBe(1)
    expect(README).toContain(`\`"minLines": ${config.minLines}\``)
  })

  it('documents every configured ignore glob in the jscpd README', () => {
    const undocumented = config.ignore.filter(glob => !README.includes(`\`${glob}\``))
    expect(undocumented).toEqual([])
  })

  it('lists only configured globs in the README exceptions table', () => {
    const tableGlobs = [...README.matchAll(/^\| `([^`]+)` +\|/gm)].map(match => match[1])
    expect(tableGlobs.filter(glob => !config.ignore.includes(glob ?? ''))).toEqual([])
  })
})
