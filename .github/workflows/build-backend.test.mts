import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('backend image build', () => {
  it('keeps the deployed native-addon smoke script syntactically valid', () => {
    expect(() =>
      execFileSync(process.execPath, ['--check', 'ci/check-deployed-worker-native-addons.mjs']),
    ).not.toThrow()
  })
})
