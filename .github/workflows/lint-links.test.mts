import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Workflow = {
  on?: {
    pull_request?: null | { paths?: string[] }
    push?: { branches?: string[]; paths?: string[] }
  }
  jobs?: Record<
    string,
    {
      steps?: Array<{
        env?: Record<string, string>
        name?: string
        run?: string
        shell?: string
        uses?: string
        'timeout-minutes'?: number
      }>
    }
  >
}

const workflow = load(readFileSync('.github/workflows/lint-links.yml', 'utf8')) as Workflow

describe('lint-links workflow', () => {
  it('runs for every PR and main push so non-Markdown target deletions are checked', () => {
    expect(workflow.on?.pull_request).toBeNull()
    expect(workflow.on?.push).toEqual({ branches: ['main'] })
  })

  it('passes the GitHub token to Lychee for GitHub link checks', () => {
    const checkStep = workflow.jobs?.['lint-links']?.steps?.find(
      step => step.name === 'Check links',
    )

    expect(checkStep?.run).toBe('./ci/lint-links.sh')
    expect(checkStep?.env).toMatchObject({ GITHUB_TOKEN: '${{ github.token }}' })
  })

  it('probes the narrowly scoped Lychee exclusions before checking repository links', () => {
    const steps = workflow.jobs?.['lint-links']?.steps ?? []
    const setupLycheeIndex = steps.findIndex(step => step.uses === './.github/actions/setup-lychee')
    const probeIndex = steps.findIndex(step => step.name === 'Verify link exclusions')
    const checkLinksIndex = steps.findIndex(step => step.name === 'Check links')
    const probe = steps[probeIndex]
    const checkLinks = steps[checkLinksIndex]
    const probeInputLines = probe?.run
      ?.split('| lychee', 1)[0]
      ?.split('\n')
      .map(line => line.trim())

    expect(setupLycheeIndex).toBeGreaterThanOrEqual(0)
    expect(probeIndex).toBe(setupLycheeIndex + 1)
    expect(probeIndex).toBeLessThan(checkLinksIndex)
    expect(probe?.['timeout-minutes']).toBeTypeOf('number')
    expect(probe?.['timeout-minutes']).toBeGreaterThan(0)
    expect(probe?.['timeout-minutes']).toBeLessThan(checkLinks?.['timeout-minutes'] ?? 0)
    expect(probe?.env).toBeUndefined()
    expect(probe?.shell).toBe('bash')
    expect(probe?.run).toContain('lychee --dump --cache=false --config lychee.toml -')
    expect(probeInputLines).toEqual(
      expect.arrayContaining([
        "'https://github.com/vouchington/vouchington-machines' \\",
        "'https://github.com/vouchington/vouchington-machines/tree/main' \\",
        "'https://github.com/vouchington/vouchington-machines?tab=readme' \\",
        "'https://github.com/vouchington/vouchington-machines#readme' \\",
        "'https://host' \\",
        "'https://host/ap/users/:userId#main-key' \\",
        "'https://github.com/vouchington/vouchington-machines-evil/pull/5' \\",
        "'https://hostname/ap/users/1' \\",
        "'https://github.com/openai/openai-node' \\",
      ]),
    )
  })
})
