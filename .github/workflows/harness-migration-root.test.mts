import { existsSync, readFileSync } from 'node:fs'

import { parse } from 'yaml'
import { describe, expect, it, vi } from 'vitest'

import {
  dispatchHarnessSession,
  type HarnessDispatchEnvironment,
} from '../../ci/harness-session-dispatch.mts'

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
  permissions?: Record<string, string>
  jobs?: Record<
    string,
    {
      if?: string
      env?: unknown
      environment?: unknown
      outputs?: Record<string, string>
      'runs-on'?: string | string[]
      steps?: Array<{ env?: unknown; id?: string; run?: string; uses?: string }>
      uses?: string
      with?: Record<string, string>
    }
  >
}

function readWorkflow(file: string) {
  const path = `.github/workflows/${file}`
  const text = readFileSync(path, 'utf8')
  return { text, workflow: parse(text) as Workflow }
}

describe('root Auto Harness migration safety audit', () => {
  it('gates all caller entry jobs before any dispatch side effect', () => {
    for (const [file, entryJob, surfaceGate] of callerEntries) {
      const { workflow } = readWorkflow(file)
      const condition = workflow.jobs?.[entryJob]?.if
      if (condition === undefined) throw new Error(`Missing condition for ${file}#${entryJob}`)
      expect(condition).toContain("vars.HARNESS_DISPATCH_ENABLED == 'true'")
      expect(condition).toContain(`vars.${surfaceGate} == 'true'`)
      const dispatchJobs = Object.values(workflow.jobs ?? {}).filter(job =>
        job.uses?.endsWith('/harness-dispatch.yml'),
      )
      expect(dispatchJobs).not.toHaveLength(0)
      for (const job of dispatchJobs) expect(job.with?.['surface-gate']).toBe(surfaceGate)
    }
  })

  it('keeps the reusable boundary immutable, scoped, and credential-minimal', () => {
    const { text, workflow } = readWorkflow('harness-dispatch.yml')
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(Object.keys(workflow.jobs ?? {})).toEqual(['dispatch'])

    const job = workflow.jobs?.dispatch
    expect(job?.environment).toBe('auto-harness')
    expect(JSON.stringify(job)).toContain('HARNESS_API_KEY')
    expect(JSON.stringify(job)).not.toContain('AUTOMATION_GITHUB_TOKEN')

    const runScripts = job?.steps?.map(step => step.run ?? '').join('\n') ?? ''
    expect(runScripts).not.toMatch(/(?:^|[\s;&|])(?:curl|wget)(?=\s|$)/u)
    expect(text).toContain('ref: ${{ github.workflow_sha }}')
    expect(text).toContain('persist-credentials: false')
    expect(text).toContain('ci/harness-session-dispatch.mts')
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

  it('matches the Auto Harness create-session contract and exact allowed origin', async () => {
    const environment: HarnessDispatchEnvironment = {
      HARNESS_API_KEY: 'test-token',
      HARNESS_CONCURRENCY_ID: 'fix-123',
      HARNESS_DISPATCH_ENABLED: 'true',
      HARNESS_FALLBACKS: '[]',
      HARNESS_PROMPT: 'Fix the issue',
      HARNESS_QUEUE_TTL_SECONDS: '3600',
      HARNESS_REPOSITORY_ID: 'repo-1',
      HARNESS_TARGET: '{"providerId":"provider-1"}',
      HARNESS_TIMEOUT: '600',
      HARNESS_URL: 'https://harness.example.com',
    }
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          created: true,
          id: 'sess-0123abcd',
          url: 'https://harness.example.com/sessions/sess-0123abcd',
        }),
        { status: 201 },
      ),
    )

    await dispatchHarnessSession(environment, fetchImplementation)
    const [url, init] = fetchImplementation.mock.calls[0] ?? []
    expect(url).toBe('https://harness.example.com/api/v1/sessions')
    const body = JSON.parse(String(init?.body))
    expect(body).toMatchObject({ concurrencyId: 'fix-123' })
    expect(body).not.toHaveProperty('concurrencyKey')
    expect(body).not.toHaveProperty('onConflict')

    await expect(
      dispatchHarnessSession(
        { ...environment, HARNESS_URL: 'https://harness.example.com/base' },
        fetchImplementation,
      ),
    ).rejects.toThrow('HARNESS_URL must be an exact https origin')
  })
})
