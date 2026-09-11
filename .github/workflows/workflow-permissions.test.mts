import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { githubWorkflowPaths } from '../../ci/repo-topology.mts'
import { missingTopLevelPermissionPaths } from './workflow-permissions-audit.mts'
import { assertNoWorkflowViolations } from './workflow-test-helpers.mts'

type Workflow = {
  permissions?: unknown
}

function readWorkflow(path: string): Workflow {
  return load(readFileSync(path, 'utf8')) as Workflow
}

describe('workflow top-level permissions', () => {
  it('every non-reusable workflow declares a top-level permissions block', () => {
    assertNoWorkflowViolations(
      missingTopLevelPermissionPaths(githubWorkflowPaths()),
      'Workflows missing top-level permissions:',
    )
  })

  it('pins the Harness dispatch workflow to read-only repository permissions', () => {
    const dispatch = readWorkflow('.github/workflows/harness-dispatch.yml')

    expect(dispatch.permissions).toEqual({ contents: 'read' })
  })
})
