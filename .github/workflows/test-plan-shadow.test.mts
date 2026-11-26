import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Env = Record<string, string>
type Step = { name?: string; env?: Env }
type Doc = { env?: Env; jobs: { shadow: { env?: Env; steps: Step[] } } }

const doc = load(readFileSync('.github/workflows/test-plan-shadow.yml', 'utf8')) as Doc
const script = readFileSync('.github/workflows/test-plan-shadow-compute-plans.sh', 'utf8')

describe('test plan shadow token scope', () => {
  it('sets no workflow-level or job-level token', () => {
    expect(doc.env?.GH_TOKEN).toBeUndefined()
    expect(doc.jobs.shadow.env?.GH_TOKEN).toBeUndefined()
  })

  it('gives the token only to steps that call gh or git with it', () => {
    const names = doc.jobs.shadow.steps.filter(step => step.env?.GH_TOKEN).map(step => step.name)
    expect(names).toEqual(['Find JUnit reports', 'Download JUnit reports', 'Compute test plans'])
  })

  it('drops the token before the planner reads pull request files', () => {
    const unset = script.indexOf(
      'unset GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0 GH_TOKEN',
    )
    expect(unset).toBeGreaterThan(script.indexOf('git fetch'))
    expect(unset).toBeLessThan(script.indexOf('tests plan'))
  })
})
