import { describe, expect, it } from 'vitest'

import {
  dedicatedToolingWorkflowProjectNames,
  toolingTestProjectNames,
  toolingWorkflowProjectNames,
} from './vitest-config/tooling-project-registry.mts'

describe('tooling project registry', () => {
  it('keeps route bounds in developer tooling runs, but gives CI a dedicated project', () => {
    expect(toolingTestProjectNames).toContain('i18n-route-bounds')
    expect(toolingWorkflowProjectNames).not.toContain('i18n-route-bounds')
    expect(dedicatedToolingWorkflowProjectNames).toEqual(['i18n-route-bounds'])
  })
})
