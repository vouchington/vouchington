import { describe, expect, it } from 'vitest'

import { checkTargetedGuardrails } from './index.mts'

describe('targeted guardrails', () => {
  it('rejects contexts outside a git repository', () => {
    const result = checkTargetedGuardrails({
      isInsideGitRepo: false,
      repoRoot: '/tmp/example',
      trackedFiles: [],
      trackedFileSet: new Set(),
    })

    expect(result.errors).toEqual(['::error::/tmp/example is not inside a git repository'])
  })

  it('returns no errors when neither doc-sync pair is tracked', () => {
    const result = checkTargetedGuardrails({
      isInsideGitRepo: true,
      repoRoot: '/tmp/example',
      trackedFiles: [],
      trackedFileSet: new Set(),
    })

    expect(result.errors).toEqual([])
  })
})
