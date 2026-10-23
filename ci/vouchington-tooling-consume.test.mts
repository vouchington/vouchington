import { execFile as execFileCallback } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const execFile = promisify(execFileCallback)

describe('vouchington-tooling consume wrappers', () => {
  it('installs a verified tarball with npm and removes its temporary directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tooling-installer-tarball-'))
    const ciDir = join(dir, 'ci')
    const archiveDir = join(dir, 'package')
    const tarball = join(dir, 'published.tgz')
    const packageJson = join(dir, 'package.json')
    const installDir = join(dir, 'install')
    await mkdir(ciDir)
    await mkdir(archiveDir)
    await mkdir(installDir)
    await writeFile(join(installDir, 'package.json'), JSON.stringify({ private: true }))
    await writeFile(
      join(archiveDir, 'package.json'),
      JSON.stringify({ name: 'vouchington-tooling', version: '9.9.9' }),
    )
    await execFile('tar', ['-czf', tarball, '-C', dir, 'package'])
    const integrity = createHash('sha512')
      .update(await readFile(tarball))
      .digest('base64')
    await writeFile(
      packageJson,
      JSON.stringify({ devDependencies: { 'vouchington-tooling': '^9.9.9' } }),
    )
    await writeFile(
      join(dir, 'pnpm-lock.yaml'),
      `importers:
  .:
    devDependencies:
      vouchington-tooling:
        specifier: ^9.9.9
        version: 9.9.9
packages:
  vouchington-tooling@9.9.9:
    resolution: {integrity: sha512-${integrity}}
`,
    )
    await writeFile(
      join(ciDir, 'install-vouchington-tooling.sh'),
      readFileSync(resolve('ci/install-vouchington-tooling.sh')),
    )
    await writeFile(
      join(ciDir, 'curl-to.sh'),
      'ci_download_to() { cp "$DOWNLOAD_PACKAGE" "$2"; }\n',
    )
    try {
      await execFile(
        'bash',
        [join(ciDir, 'install-vouchington-tooling.sh'), installDir, packageJson],
        {
          cwd: dir,
          env: {
            ...process.env,
            DOWNLOAD_PACKAGE: tarball,
            npm_config_cache: join(dir, 'npm-cache'),
            // This dependency-free tarball is local; registry audits are not this wrapper's contract.
            npm_config_offline: 'true',
            npm_config_audit: 'false',
            npm_config_fund: 'false',
            npm_config_update_notifier: 'false',
            TMPDIR: dir,
          },
        },
      )
      expect(
        JSON.parse(
          await readFile(join(installDir, 'node_modules/vouchington-tooling/package.json'), 'utf8'),
        ),
      ).toMatchObject({ name: 'vouchington-tooling', version: '9.9.9' })
      expect((await readdir(dir)).filter(name => name.startsWith('vt.'))).toEqual([])
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })

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
