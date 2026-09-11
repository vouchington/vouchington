import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

describe('dev/ci-local wrapper', () => {
  it('handles help and malformed arguments outside a repository without invoking git', async () => {
    const execFileAsync = promisify(execFile)
    const scriptPath = fileURLToPath(new URL('./ci-local', import.meta.url))
    const dir = await mkdtemp(join(tmpdir(), 'voucha-ci-local-wrapper-'))
    const binDir = join(dir, 'bin')
    const gitLog = join(dir, 'git.log')
    await mkdir(binDir)
    const gitPath = join(binDir, 'git')
    await writeFile(gitPath, `#!/bin/bash\necho called >> "${gitLog}"\nexit 99\n`)
    await chmod(gitPath, 0o755)
    const env = { ...process.env, PATH: `${binDir}:${dirname(process.execPath)}:/usr/bin:/bin` }

    try {
      const help = await execFileAsync('/bin/bash', [scriptPath, '--help'], { cwd: dir, env })
      expect(help.stdout).toContain('Usage:')
      await expect(
        execFileAsync('/bin/bash', [scriptPath, '--wat'], { cwd: dir, env }),
      ).rejects.toMatchObject({ code: 1 })
      await expect(readFile(gitLog, 'utf8')).rejects.toThrow(/ENOENT/)
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })
})
