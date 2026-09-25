import { execFile as execFileCallback } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const execFile = promisify(execFileCallback)

describe('vouchington-tooling consume wrappers', () => {
  it('downloads the exact root-importer lockfile version', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tooling-installer-lock-'))
    const ciDir = join(dir, 'ci')
    const downloadUrl = join(dir, 'download-url.txt')
    const packageJson = join(dir, 'package.json')
    await mkdir(ciDir)
    await writeFile(
      packageJson,
      JSON.stringify({ devDependencies: { 'vouchington-tooling': '^9.9.9' } }),
    )
    await writeFile(
      join(dir, 'pnpm-lock.yaml'),
      `lockfileVersion: '9.0'

importers:
  .:
    devDependencies:
      vouchington-tooling:
        specifier: ^9.9.9
        version: 9.9.9

packages:
  vouchington-tooling@9.9.9:
    resolution: {integrity: sha512-placeholder}
`,
    )
    await writeFile(
      join(ciDir, 'install-vouchington-tooling.sh'),
      readFileSync(resolve('ci/install-vouchington-tooling.sh')),
    )
    await writeFile(
      join(ciDir, 'curl-to.sh'),
      `ci_download_to() {
  printf '%s\\n' "$1" > "$DOWNLOAD_URL"
  return 1
}
`,
    )
    await chmod(join(ciDir, 'install-vouchington-tooling.sh'), 0o755)
    try {
      await expect(
        execFile(
          'bash',
          [join(ciDir, 'install-vouchington-tooling.sh'), join(dir, 'install'), packageJson],
          { cwd: dir, env: { ...process.env, DOWNLOAD_URL: downloadUrl } },
        ),
      ).rejects.toThrow(/failed to download vouchington-tooling@9\.9\.9/)
      expect(await readFile(downloadUrl, 'utf8')).toContain('vouchington-tooling-9.9.9.tgz')
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })
})
