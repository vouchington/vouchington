import { execFile } from 'node:child_process'

import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

describe('workflow shell scripts', () => {
  it('check-needs-results fails when a needed job failed', async () => {
    await expect(
      execFileAsync('./ci/check-needs-results.sh', ['required jobs'], {
        env: {
          ...process.env,
          RESULTS: '{"static-code-analysis":{"result":"failure"}}',
        },
      }),
    ).rejects.toMatchObject({ code: 1 })
  })
})
