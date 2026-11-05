import { describe, expect, it } from 'vitest'

import type { CiPathFilters, OpsWorkflow } from '../../ci/workflow-ops-policy.mts'
import { workflowScriptOwnershipViolations } from '../../ci/workflow-script-ownership-policy.mts'

const workflowFixture = {
  '.github/workflows/owned.yml': {
    on: {
      pull_request: { paths: ['ci/check-one.sh', 'ci/check-two.sh'] },
      push: { paths: ['ci/check-one.sh', 'ci/check-two.sh'] },
    },
    jobs: {
      checks: {
        steps: [{ run: 'bash ./ci/check-one.sh' }, { with: { command: 'ci/check-two.sh' } }],
      },
    },
  },
} satisfies Record<string, OpsWorkflow>

const pathFilters = {
  tooling: ['ci/**'],
  'shell-scripts': ['ci/*.sh'],
} satisfies CiPathFilters

describe('workflow script ownership', () => {
  it('accepts referenced shell scripts owned by shared and workflow trigger filters', () => {
    expect(workflowScriptOwnershipViolations(workflowFixture, pathFilters)).toEqual([])
  })

  it('reports literal shared-filter and trigger gaps for referenced scripts', () => {
    const brokenWorkflow = {
      '.github/workflows/owned.yml': {
        ...workflowFixture['.github/workflows/owned.yml'],
        on: {
          pull_request: { paths: ['ci/check-one.sh'] },
          push: { paths: ['ci/check-one.sh'] },
        },
      },
    } satisfies Record<string, OpsWorkflow>
    const brokenFilters = {
      tooling: ['ci/check-one.sh'],
      'shell-scripts': ['ci/check-one.sh'],
    } satisfies CiPathFilters

    expect(workflowScriptOwnershipViolations(brokenWorkflow, brokenFilters)).toEqual([
      'tooling filter misses: ci/check-two.sh',
      'shell-scripts filter misses: ci/check-two.sh',
      '.github/workflows/owned.yml pull_request.paths missing ci/check-two.sh',
      '.github/workflows/owned.yml push.paths missing ci/check-two.sh',
    ])
  })
})
