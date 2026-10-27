import { execFile as execFileCallback } from 'node:child_process'
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const execFile = promisify(execFileCallback)

describe('vouchington-tooling consume wrapper', () => {
  it.each([false, true])('uses the frozen graph and propagates install failure: %s', async fail => {
    const dir = await mkdtemp(join(tmpdir(), 'tooling-installer-'))
    const bin = join(dir, 'bin')
    const calls = join(dir, 'calls')
    const destination = join(dir, 'install')
    await mkdir(bin)
    await writeFile(
      join(bin, 'pnpm'),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$CALLS"
[ "$npm_config_userconfig" = /dev/null ]
[ "$npm_config_registry" = https://registry.npmjs.org/ ]
if [ "$3" = install ]; then
  [ "$4" = --frozen-lockfile ]
  [ "$5" = --filter ]
  [ "$6" = @voucha/ci... ]
  [ "$7" = --prod ]
  [ "$8" = --ignore-scripts ]
  [ "$FAIL_INSTALL" = false ] || exit 17
else
  [ "$3" = --filter ]
  [ "$4" = @voucha/ci ]
  [ "$5" = deploy ]
  [ "$6" = --prod ]
  [ "$7" = --legacy ]
  [ "$8" = --ignore-scripts ]
  [ "$9" = --frozen-lockfile ]
  mkdir -p "\${10}/node_modules/vouchington-tooling"
fi
`,
    )
    await chmod(join(bin, 'pnpm'), 0o755)
    try {
      const result = execFile(
        'bash',
        [resolve('ci/install-vouchington-tooling.sh'), destination, join(dir, 'package.json')],
        {
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            CALLS: calls,
            FAIL_INSTALL: String(fail),
            npm_config_registry: 'https://untrusted.invalid/',
          },
        },
      )
      const code = await result.then(
        () => 0,
        (err: { code: number }) => err.code,
      )
      expect(code).toBe(fail ? 17 : 0)
      const expectedCalls = [
        `--dir ${dir} install --frozen-lockfile --filter @voucha/ci... --prod --ignore-scripts`,
        `--dir ${dir} --filter @voucha/ci deploy --prod --legacy --ignore-scripts --frozen-lockfile ${destination}`,
      ]
      expect((await readFile(calls, 'utf8')).trim().split('\n')).toEqual(
        expectedCalls.slice(0, fail ? 1 : 2),
      )
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })
})
