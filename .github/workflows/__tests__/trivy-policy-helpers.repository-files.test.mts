import { execFileSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

import { GIT_LS_FILES_MAX_BUFFER_BYTES } from '../trivy-policy-helpers.mts'

describe('trivy-policy-helpers', () => {
  it('allows a bounded tracked-file manifest sufficient for the repository', () => {
    const manifest = execFileSync('git', ['ls-files', '-z'], {
      encoding: 'utf8',
      maxBuffer: GIT_LS_FILES_MAX_BUFFER_BYTES,
    })

    expect(Buffer.byteLength(manifest)).toBeLessThanOrEqual(GIT_LS_FILES_MAX_BUFFER_BYTES)
  })
})
