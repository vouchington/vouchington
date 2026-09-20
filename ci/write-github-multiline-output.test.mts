import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('write-github-multiline-output', () => {
  it('uses the verified archive fallback before dependencies exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gha-output-preinstall-'))
    const archiveRoot = join(dir, 'archive')
    const bin = join(dir, 'bin')
    const ciDir = join(dir, 'ci')
    const output = join(dir, 'github-output.txt')
    const tgz = join(dir, 'vouchington-tooling.tgz')
    await mkdir(join(archiveRoot, 'package', 'scripts', 'gha'), { recursive: true })
    await mkdir(bin)
    await mkdir(ciDir)
    for (const command of [
      'awk',
      'bash',
      'cat',
      'chmod',
      'cp',
      'dirname',
      'grep',
      'gzip',
      'head',
      'mktemp',
      'mv',
      'openssl',
      'rm',
      'sed',
      'tar',
    ]) {
      const source = [`/usr/bin/${command}`, `/bin/${command}`].find(existsSync)
      if (!source) throw new Error(`missing test command: ${command}`)
      await symlink(source, join(bin, command))
    }
    await writeFile(
      join(archiveRoot, 'package', 'scripts', 'gha', 'write-github-multiline-output.sh'),
      `#!/usr/bin/env bash
set -euo pipefail
name="$1"
{
  printf '%s<<EOF\\n' "$name"
  cat
  printf 'EOF\\n'
} >> "$GITHUB_OUTPUT"
`,
    )
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn('tar', ['-czf', tgz, '-C', archiveRoot, 'package'])
      child.once('error', reject)
      child.once('close', code => {
        if (code === 0) resolvePromise()
        else reject(new Error(`tar exited with ${String(code)}`))
      })
    })
    const integrity = createHash('sha512')
      .update(await readFile(tgz))
      .digest('base64')
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ devDependencies: { 'vouchington-tooling': '^9.9.9' } }, undefined, 2),
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
    resolution: {integrity: sha512-${integrity}}
`,
    )
    for (const script of [
      'exec-vouchington-gha.sh',
      'vouchington-tooling-script.sh',
      'write-github-multiline-output.sh',
    ]) {
      await writeFile(join(ciDir, script), readFileSync(resolve('ci', script)))
    }
    await writeFile(
      join(ciDir, 'curl-to.sh'),
      `ci_download_to() {
  cp "$FIXTURE_TGZ" "$2"
}
`,
    )
    try {
      const child = spawn(
        '/bin/bash',
        [join(ciDir, 'write-github-multiline-output.sh'), 'plan_request'],
        {
          cwd: dir,
          env: {
            GITHUB_OUTPUT: output,
            FIXTURE_TGZ: tgz,
            PATH: bin,
            TMPDIR: dir,
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      )
      let stderr = ''
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', chunk => {
        stderr += chunk
      })
      child.stdin.end('first line\nsecond line\n')
      const [code] = await once(child, 'close')

      if (code !== 0) throw new Error(`output helper exited with ${String(code)}: ${stderr}`)
      expect(await readFile(output, 'utf8')).toBe(
        'plan_request<<EOF\nfirst line\nsecond line\nEOF\n',
      )
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })
})
