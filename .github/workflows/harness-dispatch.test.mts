import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

interface Workflow {
  name: string
  on: {
    workflow_call: {
      inputs: Record<string, unknown>
      outputs?: Record<string, unknown>
      secrets?: Record<string, unknown>
    }
  }
  permissions: Record<string, string>
  concurrency: { group: string; 'cancel-in-progress': boolean }
  jobs: Record<
    string,
    {
      if?: string
      needs?: string[]
      'runs-on': string | string[]
      environment?: string
      concurrency?: { group: string; queue?: string; 'cancel-in-progress': boolean }
      outputs: Record<string, string>
      steps: Array<{
        env?: Record<string, string>
        name?: string
        shell?: string
        uses?: string
        with?: Record<string, unknown>
        run?: string
      }>
    }
  >
}

const workflowPath = '.github/workflows/harness-dispatch.yml'
const workflowText = readFileSync(workflowPath, 'utf8')
const workflow = load(workflowText) as Workflow

describe('Auto Harness dispatch boundary', () => {
  it('uses the bounded reusable call contract and exposes only session outputs', () => {
    expect(workflow.name).toBe('Harness Dispatch')
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.on.workflow_call.secrets).toEqual({
      HARNESS_API_KEY: {
        required: true,
        description:
          'Repository secret explicitly forwarded by each caller; auto-harness env remains branch-policy only',
      },
    })
    expect(workflow.on.workflow_call.inputs).toMatchObject({
      'agent-ref': { required: true, type: 'string' },
      'concurrency-id': { required: true, type: 'string' },
      'expected-head-sha': { required: true, type: 'string' },
      'surface-gate': { required: true, type: 'string' },
      prompt: { required: true, type: 'string' },
    })
    expect(workflow.on.workflow_call.inputs).not.toHaveProperty('checkpoint-body')
    expect(Object.keys(workflow.on.workflow_call.outputs ?? {})).toEqual([
      'session-id',
      'session-url',
      'created',
    ])
    expect(workflow.concurrency).toEqual({
      group: 'harness-dispatch-${{ inputs.concurrency-id }}',
      'cancel-in-progress': false,
    })
    expect(workflow.jobs.dispatch.if).toContain('github.run_attempt == 1')
    expect(workflow.jobs.dispatch.if).toContain("github.ref == 'refs/heads/main'")
    expect(workflow.jobs.dispatch.if).toContain(
      "inputs.surface-gate == 'HARNESS_FIX_MAIN_ENABLED' && vars.HARNESS_FIX_MAIN_ENABLED == 'true' && vars.HARNESS_AGENT_DISPATCH_ENABLED == 'true'",
    )
  })

  it('checks out immutable workflow code and invokes only the built-in bounded client', () => {
    const job = workflow.jobs.dispatch
    expect(Object.keys(workflow.jobs)).toEqual(['dispatch'])
    expect(job?.environment).toBe('auto-harness')
    expect(job?.['runs-on']).toEqual('ubuntu-latest')
    const checkout = job?.steps.find(step => step.uses?.startsWith('actions/checkout@'))
    expect(job?.steps[0]?.uses).toMatch(/^actions\/checkout@[0-9a-f]{40}$/u)
    expect(job?.steps.indexOf(checkout!)).toBe(0)
    expect(workflowText).not.toContain('repair-workspace-permissions')
    expect(job?.needs).toBeUndefined()
    expect(job?.concurrency?.group).toBe('harness-dispatch-fleet-admission')
    expect(job?.concurrency?.queue).toBe('max')
    expect(job?.concurrency?.['cancel-in-progress']).toBe(false)
    expect(checkout?.with).toMatchObject({
      clean: false,
      'persist-credentials': false,
      ref: '${{ github.workflow_sha }}',
    })
    expect(job?.steps[1]).toEqual({
      name: 'Restore workspace cleaner',
      shell: 'bash',
      run: `rm -rf -- .github/actions/clean-workspace/action.yml ci/curl-to.sh ci/exec-vouchington-gha.sh package.json pnpm-lock.yaml
git archive --format=tar HEAD -- .github/actions/clean-workspace/action.yml ci/curl-to.sh ci/exec-vouchington-gha.sh package.json pnpm-lock.yaml | tar -x
`,
    })
    expect(job?.steps[2]).toEqual({
      uses: './.github/actions/clean-workspace',
      with: { 'preserve-node-modules': 'false' },
    })
    const setupNodePnpmIndex = job?.steps.findIndex(
      step => step.uses === './.github/actions/setup-node-pnpm',
    )
    const dispatchIndex = job?.steps.findIndex(step =>
      step.run?.includes('ci/harness-session-dispatch.mts'),
    )
    expect(setupNodePnpmIndex).toBeGreaterThan(2)
    expect(dispatchIndex).toBeGreaterThan(setupNodePnpmIndex ?? -1)
    const setupNodePnpm = job?.steps[setupNodePnpmIndex ?? -1]
    expect(setupNodePnpm?.with).toBeUndefined()
    const dispatch = job?.steps.find(step => step.run?.includes('ci/harness-session-dispatch.mts'))
    expect(dispatch?.env).toMatchObject({
      // The host daemon's worktree pool is a plain clone: only a branch already checked out
      // locally (e.g. main) resolves under `refs/heads/<name>` there. HARNESS_REF drives the
      // actual checkout, so it must be the SHA, not the branch name (confirmed live: session
      // sess-25f32a6c failed with "Failed to resolve ref refs/heads/dependabot/...: fatal:
      // Needed a single revision" while dispatched via agent-ref). AGENT_REF is metadata-only.
      AGENT_REF: '${{ inputs.agent-ref }}',
      HARNESS_REF: '${{ inputs.expected-head-sha }}',
      HARNESS_API_KEY: '${{ secrets.HARNESS_API_KEY }}',
      HARNESS_FALLBACKS:
        "${{ inputs.surface-gate == 'HARNESS_PLAN_ENABLED' && vars.HARNESS_FALLBACKS_PLAN || vars.HARNESS_FALLBACKS }}",
      HARNESS_REPOSITORY_ID: '${{ vars.HARNESS_REPOSITORY_ID }}',
      HARNESS_TARGET:
        "${{ inputs.surface-gate == 'HARNESS_PLAN_ENABLED' && vars.HARNESS_TARGET_PLAN || vars.HARNESS_TARGET }}",
      HARNESS_URL: '${{ vars.HARNESS_URL }}',
      HARNESS_TIMEOUT: '6300',
      HARNESS_PRIORITY: '20',
      HARNESS_QUEUE_TTL_SECONDS: '3600',
      HARNESS_REQUIRED_LABELS: '[]',
      SLACK_SOURCE: '${{ inputs.slack-source }}',
    })
    expect(dispatch?.env).not.toHaveProperty('HARNESS_PROVIDER_PRIORITY')
    expect(workflowText).not.toContain('pnpm install')
    expect(workflowText).not.toContain('secrets: inherit')
    expect(workflowText).not.toContain('AUTOMATION_GITHUB_TOKEN')
  })
})

describe('Auto Harness caller secret forwarding', () => {
  // Discover callers by which job `uses:` the reusable workflow. Searching for the forwarding
  // string would omit exactly an unsafe `secrets: inherit` caller; the independent textual scan
  // below guards against the structural discovery predicate silently narrowing the caller set.
  interface CallerWorkflow {
    jobs: Record<string, { uses?: string; secrets?: string | Record<string, unknown> }>
  }
  const workflowDir = '.github/workflows'
  const calleeRef = `./${workflowPath}`

  function callerJobs(path: string) {
    const caller = load(readFileSync(path, 'utf8')) as CallerWorkflow | null
    return Object.values(caller?.jobs ?? {}).filter(job => job.uses === calleeRef)
  }

  const workflowFiles = readdirSync(workflowDir)
    .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))
    .map(file => join(workflowDir, file))
  const harnessCallerPaths = workflowFiles.filter(path => callerJobs(path).length > 0)

  it('finds at least one Harness caller (guards against a broken discovery predicate)', () => {
    expect(harnessCallerPaths.length).toBeGreaterThan(0)
  })

  it('agrees with an independent textual scan (catches the YAML parse silently narrowing the set)', () => {
    // The structural predicate above (parse each workflow, filter jobs whose `uses:` matches)
    // could itself regress in a way that silently drops real callers — e.g. a YAML parse error
    // swallowed by a bad type assertion, or a job shape the parser mis-reads — while every
    // per-caller assertion below still passes vacuously for whatever subset survives. Cross-check
    // against a dumb text scan for the same `uses:` line so a narrowing bug fails loudly here
    // instead of passing silently.
    const textualCallerPaths = workflowFiles.filter(
      path => path !== workflowPath && readFileSync(path, 'utf8').includes(`uses: ${calleeRef}`),
    )
    expect(harnessCallerPaths.sort()).toEqual(textualCallerPaths.sort())
    expect(harnessCallerPaths.flatMap(callerJobs)).toHaveLength(6)
  })

  it('never forwards secrets via `secrets: inherit` to harness-dispatch.yml', () => {
    for (const path of harnessCallerPaths) {
      for (const job of callerJobs(path)) {
        expect(job.secrets).not.toBe('inherit')
      }
    }
  })

  it('forwards only HARNESS_API_KEY by name to harness-dispatch.yml', () => {
    for (const path of harnessCallerPaths) {
      for (const job of callerJobs(path)) {
        expect(job.secrets).toEqual({ HARNESS_API_KEY: '${{ secrets.HARNESS_API_KEY }}' })
      }
    }
  })
})

describe('Auto Harness dispatch metadata guard', () => {
  // The HARNESS_METADATA builder itself is a real, typechecked, linted module now (#10096 / C4);
  // its behavior is unit-tested directly in ci/harness-session-dispatch-metadata.test.mts. This
  // guards only the YAML wiring: the dispatch step must call that file, not embed inline Node.
  it('builds HARNESS_METADATA via the extracted script, not an inline node -e block', () => {
    const dispatchStep = workflow.jobs.dispatch.steps.find(step =>
      step.run?.includes('ci/harness-session-dispatch.mts'),
    )
    expect(dispatchStep?.run).toContain(
      'HARNESS_METADATA="$(node ci/harness-session-dispatch-metadata.mts)"',
    )
    expect(dispatchStep?.run).not.toContain('--input-type=module')
  })
})
