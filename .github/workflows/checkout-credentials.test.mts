import { readdirSync, readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import {
  assertNoWorkflowViolations,
  workflowHasTrigger,
} from '../test-helpers/workflow-fixtures.mts'

type Step = {
  name?: string
  uses?: string
  with?: Record<string, unknown>
}

type Job = {
  permissions?: unknown
  steps?: Step[]
}

type Workflow = {
  on?: unknown
  jobs?: Record<string, Job>
  permissions?: unknown
}

// `id-token: write` is the OIDC token, not the git credential actions/checkout persists.
const NON_GIT_CREDENTIAL_SCOPES = new Set(['id-token'])

const workflowPaths = readdirSync('.github/workflows').flatMap(file =>
  file.endsWith('.yml') || file.endsWith('.yaml') ? [`.github/workflows/${file}`] : [],
)

function readWorkflow(path: string): Workflow {
  return load(readFileSync(path, 'utf8')) as Workflow
}

function githubTokenWriteScopes(permissions: unknown): string[] {
  if (permissions === 'write-all') return ['write-all']
  if (permissions == null || typeof permissions !== 'object' || Array.isArray(permissions))
    return []
  return Object.entries(permissions)
    .filter(([scope, access]) => access === 'write' && !NON_GIT_CREDENTIAL_SCOPES.has(scope))
    .map(([scope]) => scope)
}

function jobWriteScopes(workflow: Workflow, job: Job): string[] {
  if (job.permissions !== undefined) return githubTokenWriteScopes(job.permissions)
  if (workflow.permissions !== undefined) return githubTokenWriteScopes(workflow.permissions)
  // A reusable workflow with no permissions block inherits the caller's token.
  if (workflowHasTrigger(workflow.on, 'workflow_call')) return ['caller']
  return []
}

function checkoutCredentialViolations(path: string, workflow: Workflow): string[] {
  return Object.entries(workflow.jobs ?? {}).flatMap(([jobId, job]) => {
    const scopes = jobWriteScopes(workflow, job)
    if (scopes.length === 0) return []
    return (job.steps ?? []).flatMap((step, index) => {
      if (!step.uses?.startsWith('actions/checkout@')) return []
      if (step.with?.['persist-credentials'] === false) return []
      const label = `${path}#${jobId} step ${step.name ?? index}`
      return [
        `${label}: set persist-credentials: false; the job token can write (${scopes.join(', ')})`,
      ]
    })
  })
}

describe('checkout credentials', () => {
  it('rejects a write-capable checkout that keeps the default git credential', () => {
    const workflow: Workflow = {
      permissions: { contents: 'read' },
      jobs: {
        rerun: {
          permissions: { actions: 'write', contents: 'read' },
          steps: [{ uses: 'actions/checkout@example' }],
        },
      },
    }

    expect(checkoutCredentialViolations('wf', workflow)).toEqual([
      'wf#rerun step 0: set persist-credentials: false; the job token can write (actions)',
    ])
  })

  it('allows read-only tokens, OIDC, and an explicit opt-out', () => {
    const readOnly: Workflow = {
      permissions: { contents: 'read' },
      jobs: { test: { steps: [{ uses: 'actions/checkout@example' }] } },
    }
    const oidc: Workflow = {
      permissions: { contents: 'read', 'id-token': 'write' },
      jobs: { deploy: { steps: [{ uses: 'actions/checkout@example' }] } },
    }
    const explicit: Workflow = {
      jobs: {
        publish: {
          permissions: { packages: 'write' },
          steps: [{ uses: 'actions/checkout@example', with: { 'persist-credentials': false } }],
        },
      },
    }
    const callerInherited: Workflow = {
      on: { workflow_call: null },
      jobs: { build: { steps: [{ uses: 'actions/checkout@example' }] } },
    }

    expect(checkoutCredentialViolations('wf', readOnly)).toEqual([])
    expect(checkoutCredentialViolations('wf', oidc)).toEqual([])
    expect(checkoutCredentialViolations('wf', explicit)).toEqual([])
    expect(checkoutCredentialViolations('wf', callerInherited)).toEqual([
      'wf#build step 0: set persist-credentials: false; the job token can write (caller)',
    ])
  })

  it('keeps write-capable GITHUB_TOKEN checkouts from persisting credentials', () => {
    const violations = workflowPaths.flatMap(path =>
      checkoutCredentialViolations(path, readWorkflow(path)),
    )

    assertNoWorkflowViolations(violations)
  })
})
