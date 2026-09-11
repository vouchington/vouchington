import { describe, expect, it } from 'vitest'

import { liveTopologyAuditErrors } from './check-live-workflow-topology.mts'
import { makeTopology, makeWorkflow } from './workflow-topology-test-fixtures.mts'

describe('live topology audit', () => {
  it('surfaces topology diagnostics before policy or inventory checks', () => {
    expect(
      liveTopologyAuditErrors(
        makeTopology({
          diagnostics: [
            {
              severity: 'error',
              code: 'malformed-workflow',
              message: 'broken yaml',
              workflowPath: '.github/workflows/broken.yml',
            },
          ],
        }),
      ),
    ).toEqual(['.github/workflows/broken.yml: broken yaml'])
  })

  it('reports missing secret inventory entries once diagnostics are empty', () => {
    expect(
      liveTopologyAuditErrors(
        makeTopology({
          workflows: [
            makeWorkflow({
              id: 'wf',
              path: 'fixture/wf.yml',
              secretReferences: ['UNKNOWN_FIXTURE_SECRET'],
            }),
          ],
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        'secret UNKNOWN_FIXTURE_SECRET is referenced with no SECRET_INVENTORY entry',
      ]),
    )
  })
})
