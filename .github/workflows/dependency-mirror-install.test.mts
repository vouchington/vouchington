import { execFile } from 'node:child_process'
import { access, constants, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const exec = promisify(execFile)

describe('dependency mirror installer', () => {
  it.each([0, 42])('rejects an unverified regctl download (curl exit %i)', async curlExit => {
    const directory = await mkdtemp(join(tmpdir(), 'dependency-mirror-install-'))
    try {
      await writeFile(
        join(directory, 'curl'),
        `#!/bin/sh
if [ "$CURL_EXIT" != 0 ]; then exit "$CURL_EXIT"; fi
while [ "$#" -gt 0 ]; do
  if [ "$1" = --output ]; then
    printf 'corrupted download' > "$2"
    exit 0
  fi
  shift
done
exit 2
`,
        { mode: 0o755 },
      )
      const target = join(directory, 'regctl')
      const result = await exec(
        'bash',
        ['-e', resolve('.github/workflows/dependency-mirror-install-regctl.sh')],
        {
          env: {
            ...process.env,
            PATH: `${directory}:${process.env.PATH}`,
            REGCTL_PATH: target,
            CURL_EXIT: String(curlExit),
          },
        },
      ).then(
        () => 0,
        (err: unknown) => (err as Error & { code: number }).code,
      )

      expect(result).toBe(curlExit || 1)
      await expect(access(target, constants.X_OK)).rejects.toMatchObject({
        code: curlExit ? 'ENOENT' : 'EACCES',
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
