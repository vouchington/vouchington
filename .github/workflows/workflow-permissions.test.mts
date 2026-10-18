import { describe, it } from 'vitest'

import { githubWorkflowPaths } from '../../ci/repo-topology.mts'
import { missingTopLevelPermissionPaths } from './workflow-permissions-audit.mts'
import { assertNoWorkflowViolations } from '../test-helpers/workflow-fixtures.mts'

describe('workflow top-level permissions', () => {
  it('every non-reusable workflow declares a top-level permissions block', () => {
    assertNoWorkflowViolations(
      missingTopLevelPermissionPaths(githubWorkflowPaths()),
      'Workflows missing top-level permissions:',
    )
  })
})
