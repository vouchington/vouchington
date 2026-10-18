import { existsSync, readFileSync } from 'node:fs'

import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

const callerEntries = [
  ['fix-dependabot.yml', 'triage-and-rerun', 'HARNESS_FIX_DEPENDABOT_ENABLED'],
  ['fix-issue.yml', 'gate', 'HARNESS_FIX_ISSUE_ENABLED'],
  ['fix-main.yml', 'triage-and-rerun', 'HARNESS_FIX_MAIN_ENABLED'],
  ['merge-queue-ejection.yml', 'render-prompt', 'HARNESS_MERGE_QUEUE_EJECTION_ENABLED'],
  ['plan.yml', 'gate', 'HARNESS_PLAN_ENABLED'],
  ['scheduled-prompts.yml', 'select-prompt', 'HARNESS_SCHEDULED_ENABLED'],
  ['shepherd.yml', 'gate', 'HARNESS_SHEPHERD_ENABLED'],
] as const

interface Workflow {
  jobs?: Record<
    string,
    {
      if?: string
      uses?: string
      secrets?: Record<string, string>
      with?: Record<string, string>
    }
  >
}

function readWorkflow(file: string) {
  const text = readFileSync(`.github/workflows/${file}`, 'utf8')
  return { text, workflow: parse(text) as Workflow }
}

describe('root Auto Harness migration safety audit', () => {
  it('gates all caller entry jobs before any dispatch side effect', () => {
    const pinnedDispatches = new Set<string>()
    for (const [file, entryJob, surfaceGate] of callerEntries) {
      const { workflow } = readWorkflow(file)
      const condition = workflow.jobs?.[entryJob]?.if
      if (condition === undefined) throw new Error(`Missing condition for ${file}#${entryJob}`)
      expect(condition).toContain("vars.HARNESS_DISPATCH_ENABLED == 'true'")
      expect(condition).toContain(`vars.${surfaceGate} == 'true'`)
      const dispatchJobs = Object.values(workflow.jobs ?? {}).filter(job =>
        job.uses?.includes('/harness-dispatch.yml@'),
      )
      expect(dispatchJobs).not.toHaveLength(0)
      for (const job of dispatchJobs) {
        expect(job.uses).toMatch(
          /^vouchington\/vouchington-tooling\/\.github\/workflows\/harness-dispatch\.yml@[0-9a-f]{40}$/u,
        )
        pinnedDispatches.add(job.uses ?? '')
        expect(job.with?.['surface-gate']).toBe(surfaceGate)
        expect(job.secrets).toEqual({ HARNESS_API_KEY: '${{ secrets.HARNESS_API_KEY }}' })
      }
    }
    expect(pinnedDispatches.size).toBe(1)
    expect(readWorkflow('fix-main.yml').workflow.jobs?.dispatch?.with?.['additional-gate']).toBe(
      'HARNESS_AGENT_DISPATCH_ENABLED',
    )
    const planInputs = readWorkflow('plan.yml').workflow.jobs?.dispatch?.with
    expect(planInputs?.['surface-gate']).toBe('HARNESS_PLAN_ENABLED')
    expect(planInputs).not.toHaveProperty('target-variable')
    expect(planInputs).not.toHaveProperty('fallbacks-variable')
  })

  it('names every Harness concurrency identity in the configured namespace', () => {
    const identities = callerEntries.flatMap(([file]) =>
      Object.values(readWorkflow(file).workflow.jobs ?? {}).flatMap(job =>
        job.with?.['concurrency-id'] === undefined ? [] : [job.with['concurrency-id']],
      ),
    )
    expect(identities).not.toHaveLength(0)
    expect(identities.every(identity => identity.startsWith('vouchington:'))).toBe(true)
  })

  it('uses only current intent commands and resolvable automation prompt paths', () => {
    const callerText = callerEntries.map(([file]) => readWorkflow(file).text).join('\n')
    expect(callerText).not.toContain('/codex-fix')
    expect(callerText).not.toContain('/codex-plan')
    expect(callerText).not.toMatch(/[`'"]\/pr-shepherd(?:[`'"]|\s)/u)

    const promptPaths = callerText.match(/docs\/prompts\/[A-Za-z0-9_./-]+\.md/gu) ?? []
    expect(promptPaths.length).toBeGreaterThan(0)
    for (const promptPath of new Set(promptPaths)) {
      if (!existsSync(promptPath)) throw new Error(`Missing automation prompt: ${promptPath}`)
    }
  })
})
