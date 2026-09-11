import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import { executeTrustedVersionStep } from './shepherd.test-helpers.mts'

type VersionStep = { id?: string; run?: string; uses?: string }
type Workflow = {
  jobs?: {
    'render-prompt'?: {
      outputs?: Record<string, string>
      steps?: VersionStep[]
    }
  }
}

const workflow = load(readFileSync('.github/workflows/shepherd.yml', 'utf8')) as Workflow

describe('shepherd trusted version', () => {
  it('resolves pr-shepherd through the workspace CLI', () => {
    const renderJob = workflow.jobs?.['render-prompt']
    const setupStep = renderJob?.steps?.find(step => step.uses?.endsWith('/setup-node-pnpm'))
    const versionStep = renderJob?.steps?.find(step => step.id === 'pr-shepherd-version')

    expect(setupStep).toBeDefined()
    expect(versionStep?.run).toContain('VERSION="$(pnpm exec pr-shepherd --version)"')
    expect(versionStep?.run).not.toContain('pr-shepherd/package.json')
    expect(renderJob?.outputs?.['pr_shepherd_version']).toBe(
      '${{ steps.pr-shepherd-version.outputs.version }}',
    )
    if (!versionStep?.run) throw new Error('Missing trusted pr-shepherd version step')

    const { githubOutput, installedVersion, stdout } = executeTrustedVersionStep(versionStep.run)
    expect(stdout).toBe(`Trusted pr-shepherd version (from main): ${installedVersion}\n`)
    expect(githubOutput).toBe(`version=${installedVersion}\n`)
  })
})
