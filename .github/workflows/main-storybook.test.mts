import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = {
  name?: string
  run?: string
  uses?: string
  with?: Record<string, unknown>
}

type Job = {
  if?: string
  needs?: string[]
  permissions?: Record<string, string>
  'runs-on'?: string
  steps?: Step[]
}

type Workflow = { jobs?: Record<string, Job> }

const workflow = load(readFileSync('.github/workflows/main-storybook.yml', 'utf8')) as Workflow
const reusableWorkflow = readFileSync('.github/workflows/storybook.yml', 'utf8')

describe('Main Storybook workflow', () => {
  it('publishes one protected attempt-bound artifact only after Storybook tests succeed', () => {
    const publish = workflow.jobs?.['publish-storybook']

    expect(publish?.needs).toEqual(['storybook-build'])
    expect(publish?.if).toContain("needs.storybook-build.result == 'success'")
    expect(publish?.['runs-on']).toBe('ubuntu-latest')
    expect(publish?.permissions).toEqual({ contents: 'read' })

    const checkout = publish?.steps?.find(step => step.uses?.startsWith('actions/checkout@'))
    expect(checkout?.with).toMatchObject({ 'fetch-depth': 1, ref: '${{ github.sha }}' })

    const build = publish?.steps?.find(step => step.name === 'Build and protect Storybook artifact')
    expect(build?.run).toContain('STORYBOOK_BASE_PATH=/ pnpm run build:storybook')
    expect(build?.run).toContain('node ci/storybook-pages.mts protect web/storybook-static')
    expect(build?.run).toContain('mv web/storybook-static delivery/storybook')

    const upload = publish?.steps?.find(step => step.uses?.startsWith('actions/upload-artifact@'))
    expect(upload?.uses?.slice('actions/upload-artifact@'.length)).toMatch(/^[0-9a-f]{40}$/)
    expect(upload?.with).toMatchObject({
      'if-no-files-found': 'error',
      name: 'storybook-${{ github.run_id }}-${{ github.run_attempt }}',
      overwrite: true,
      path: 'delivery',
      'retention-days': 1,
    })
  })

  it('keeps the reusable Storybook test workflow free of the trusted deployment artifact', () => {
    expect(reusableWorkflow).not.toContain(
      'storybook-${{ github.run_id }}-${{ github.run_attempt }}',
    )
    expect(reusableWorkflow).not.toContain('delivery/storybook')
  })
})
