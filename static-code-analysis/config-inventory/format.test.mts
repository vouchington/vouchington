import { describe, expect, it } from 'vitest'

import { formatConfigInventoryMarkdown } from './index.mts'
import type { ConfigInventory } from './types.mts'

describe('config inventory Markdown format', () => {
  it('renders the compact complete Markdown report', () => {
    expect(formatConfigInventoryMarkdown(makeInventory())).toBe(
      [
        '# Config Migration Inventory',
        '',
        'Generated from tracked repository files. Run `./dev/config-inventory --format json` for machine-readable output.',
        '',
        '## Environment Variables',
        '',
        '| Name | Classifications | Contract | Sensitivity | Surfaces | Readers | Local setup | Deployment | Workflows | Docs | Package gates | Review |',
        '| ---- | --------------- | -------- | ----------- | -------- | ------- | ----------- | --------------- | --------- | ---- | ------------- | ------ |',
        '| `STORY_WINDOW_DAYS` | `dynamic-config-candidate` | `vouchington-infra:ecs-backend-environment:STORY_WINDOW_DAYS` |  |  | `backend/service.mts` |  |  |  |  |  |  |',
        '',
        '## DynamicConfig Namespaces',
        '',
        '| Namespace | Definitions | Admin registry |',
        '| --------- | ----------- | -------------- |',
        '',
        '## Package-Manager Gates',
        '',
        '| Gate | Values | Files |',
        '| ---- | ------ | ----- |',
        '',
      ].join('\n'),
    )
  })
})

function makeInventory(): ConfigInventory {
  return {
    dynamicConfigs: [],
    envVars: [
      {
        classifications: ['dynamic-config-candidate'],
        contractKey: 'vouchington-infra:ecs-backend-environment:STORY_WINDOW_DAYS',
        contractKeys: ['vouchington-infra:ecs-backend-environment:STORY_WINDOW_DAYS'],
        deployment: [],
        dockerBuildArgs: [],
        docs: [],
        localSetup: [],
        name: 'STORY_WINDOW_DAYS',
        packageGates: [],
        readers: ['backend/service.mts'],
        reviewReason: null,
        runtimeSurfaces: [],
        sensitivity: null,
        sourceOfTruth: null,
        workflows: [],
      },
    ],
    packageGates: [],
  }
}
