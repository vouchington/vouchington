import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

describe('ready dedupe script', () => {
  it('fails when an internal command fails', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ci-ready-dedupe-strict-'))
    const ghPath = join(directory, 'gh')
    const jqPath = join(directory, 'jq')

    writeFileSync(ghPath, '#!/bin/bash\nprintf \'%s\' \'{"draft":false,"labels":[]}\'\n')
    writeFileSync(
      jqPath,
      `#!/bin/bash
if [[ "$*" == *".draft"* ]]; then
  exit 41
fi
if [[ "$*" == *"[.labels[]"* ]]; then
  printf '[]'
  exit 0
fi
exit 1
`,
    )
    chmodSync(ghPath, 0o755)
    chmodSync(jqPath, 0o755)

    try {
      const result = spawnSync('bash', ['ci/ready-dedupe.sh'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          GITHUB_OUTPUT: join(directory, 'github-output'),
          GITHUB_REPOSITORY: 'owner/repo',
          EVENT_NAME: 'pull_request',
          EVENT_ACTION: 'opened',
          HEAD_SHA: 'head-sha',
          TESTED_SHA: 'merge-sha',
          PR_NUMBER: '8277',
          RUN_ID: '12345',
        },
      })

      expect(result.status).toBe(41)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
