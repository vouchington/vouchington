import { describe, expect, it } from 'vitest'

import {
  dedicatedToolingWorkflowProjectNames,
  localCoverageToolingProjectNames,
  toolingTestProjectNames,
  toolingWorkflowProjectNames,
} from './vitest-config/tooling-project-registry.mts'

describe('tooling project registry', () => {
  it('keeps route bounds in local and developer tooling runs, but gives CI a dedicated project', () => {
    expect(localCoverageToolingProjectNames).toContain('i18n-route-bounds')
    expect(toolingTestProjectNames).toContain('i18n-route-bounds')
    expect(toolingWorkflowProjectNames).not.toContain('i18n-route-bounds')
    expect(dedicatedToolingWorkflowProjectNames).toEqual(['i18n-route-bounds'])
  })
})
