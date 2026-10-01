import { execFileSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

import { GIT_LS_FILES_MAX_BUFFER_BYTES } from '../trivy-policy-helpers.mts'

// Node's execFileSync/spawnSync default `maxBuffer`; the full-repo listing crossed it in #1571.
const NODE_DEFAULT_MAX_BUFFER_BYTES = 1024 * 1024

describe('GIT_LS_FILES_MAX_BUFFER_BYTES', () => {
  it('stays above the Node default that the full-repo listing overflowed in #1571', () => {
    expect(GIT_LS_FILES_MAX_BUFFER_BYTES).toBeGreaterThan(NODE_DEFAULT_MAX_BUFFER_BYTES)
  })

  it('covers the full-repository tracked-file listing; raise the constant if this fails', () => {
    // Measure without a cap so a listing past the shared buffer fails this assertion, with the
    // fix in its title, instead of surfacing as `spawnSync git ENOBUFS` in an unrelated Tooling test.
    const listingBytes = execFileSync('git', ['ls-files', '-z'], { maxBuffer: Infinity }).length

    expect(listingBytes).toBeLessThanOrEqual(GIT_LS_FILES_MAX_BUFFER_BYTES)
  })
})
