import { describe, expect, it } from 'vitest'

import { checkTargetedGuardrails } from './index.mts'

const SOURCE_FILE = 'cloudflare-worker/src/basic-auth.mts'
const RUNBOOK_FILE = 'docs/operations/cloudflare-worker-staging-auth.md'

function checkOneTracked(file: string): string | undefined {
  return checkTargetedGuardrails({
    isInsideGitRepo: true,
    repoRoot: '/tmp/example',
    trackedFiles: [file],
    trackedFileSet: new Set([file]),
  }).errors[0]
}

describe('basic-auth doc sync guard wiring', () => {
  it('fails when only one paired file is tracked', () => {
    expect(checkOneTracked(SOURCE_FILE)).toContain(`expects ${RUNBOOK_FILE} to also be tracked`)
    expect(checkOneTracked(RUNBOOK_FILE)).toContain(`expects ${SOURCE_FILE} to also be tracked`)
  })
})
