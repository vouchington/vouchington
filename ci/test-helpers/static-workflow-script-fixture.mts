import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { onTestFinished } from 'vitest'

export function runStaticWorkflowScript(
  script: string,
  env: Record<string, string>,
  files: string[] = [],
) {
  const root = mkdtempSync(join(tmpdir(), 'static-workflow-script-'))
  onTestFinished(() => rmSync(root, { force: true, recursive: true }))
  const bin = join(root, 'bin')
  const trace = join(root, 'trace')
  mkdirSync(bin)
  mkdirSync(join(root, 'backend-query-profile-hits'))
  writeFileSync(trace, '')
  for (const file of files) writeFileSync(join(root, 'backend-query-profile-hits', file), '{}')
  writeFileSync(
    join(bin, 'git'),
    '#!/bin/bash\nprintf "git %s\\n" "$*" >> "$TRACE"\nif [[ "$1" == "cat-file" ]]; then exit "$CAT_FILE_STATUS"; fi\nexit "$FETCH_STATUS"\n',
    { mode: 0o755 },
  )
  writeFileSync(
    join(bin, 'node'),
    '#!/bin/bash\nprintf "node %s\\n" "$*" >> "$TRACE"\nexit "$NODE_STATUS"\n',
    { mode: 0o755 },
  )
  const result = spawnSync(
    'bash',
    ['-e', '-o', 'pipefail', fileURLToPath(new URL(`../${script}`, import.meta.url))],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        CAT_FILE_STATUS: '0',
        FETCH_STATUS: '0',
        NODE_STATUS: '0',
        ...env,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        TRACE: trace,
      },
    },
  )
  return { ...result, trace: readFileSync(trace, 'utf8') }
}
