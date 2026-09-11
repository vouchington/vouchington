import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const hookPath = fileURLToPath(new URL('./post-checkout', import.meta.url))

const gitIdentity = {
  GIT_AUTHOR_NAME: 'hook-test',
  GIT_AUTHOR_EMAIL: 'tests+post-checkout@voucha.ai',
  GIT_COMMITTER_NAME: 'hook-test',
  GIT_COMMITTER_EMAIL: 'tests+post-checkout@voucha.ai',
}

function realGitPath(): string {
  const result = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' })
  const path = result.stdout.trim()
  if (result.status !== 0 || path.length === 0) {
    throw new Error('git is required to exercise post-checkout')
  }
  return path
}

function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...gitIdentity },
  })
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  }
  return result.stdout.trim()
}

function createManifestRepo(changeWorkspaceYaml: boolean): {
  dir: string
  oldSha: string
  newSha: string
} {
  const dir = mkdtempSync(`${tmpdir()}/voucha-post-checkout-`)
  git(dir, ['init'])
  writeFileSync(join(dir, 'README'), 'one\n')
  git(dir, ['add', 'README'])
  git(dir, ['commit', '-m', 'init'])
  const oldSha = git(dir, ['rev-parse', 'HEAD'])
  if (changeWorkspaceYaml) {
    writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'minimumReleaseAge: 1\n')
    git(dir, ['add', 'pnpm-workspace.yaml'])
    git(dir, ['commit', '-m', 'workspace yaml'])
  } else {
    writeFileSync(join(dir, 'README'), 'two\n')
    git(dir, ['add', 'README'])
    git(dir, ['commit', '-m', 'readme'])
  }
  return { dir, oldSha, newSha: git(dir, ['rev-parse', 'HEAD']) }
}

function runHook(options: {
  branchCheckout: boolean
  changeWorkspaceYaml: boolean
  githubActions?: boolean
  omitPnpm?: boolean
  pnpmExit?: number
  oldSha?: string
  newSha?: string
}): { status: number | null; stdout: string; stderr: string; pnpmLog: string } {
  const repo = createManifestRepo(options.changeWorkspaceYaml)
  const bin = join(repo.dir, 'bin')
  mkdirSync(bin)
  const pnpmLog = join(repo.dir, 'pnpm.log')
  writeFileSync(join(bin, 'git'), `#!/bin/sh\nexec ${JSON.stringify(realGitPath())} "$@"\n`)
  chmodSync(join(bin, 'git'), 0o755)
  if (!options.omitPnpm) {
    writeFileSync(
      join(bin, 'pnpm'),
      `#!/bin/sh\nprintf '%s\\n' "$*" >> '${pnpmLog}'\nexit ${String(options.pnpmExit ?? 0)}\n`,
    )
    chmodSync(join(bin, 'pnpm'), 0o755)
  }
  try {
    const developerEnv = { ...process.env }
    delete developerEnv.GITHUB_ACTIONS
    const result = spawnSync(
      'sh',
      [
        '-e',
        hookPath,
        options.oldSha ?? repo.oldSha,
        options.newSha ?? repo.newSha,
        options.branchCheckout ? '1' : '0',
      ],
      {
        cwd: repo.dir,
        encoding: 'utf8',
        env: {
          ...developerEnv,
          ...gitIdentity,
          ...(options.githubActions ? { GITHUB_ACTIONS: 'true' } : {}),
          PATH: `${bin}:/usr/bin:/bin`,
        },
      },
    )
    let log = ''
    try {
      log = readFileSync(pnpmLog, 'utf8')
    } catch {
      log = ''
    }
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      pnpmLog: log,
    }
  } finally {
    rmSync(repo.dir, { force: true, recursive: true })
  }
}

describe('post-checkout', () => {
  it('does not install in GitHub Actions when a branch checkout changes pnpm-workspace.yaml', () => {
    const result = runHook({ branchCheckout: true, changeWorkspaceYaml: true, githubActions: true })
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('')
    expect(result.pnpmLog).toBe('')
  })

  it('installs when a branch checkout changes pnpm-workspace.yaml', () => {
    const result = runHook({ branchCheckout: true, changeWorkspaceYaml: true })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('post-checkout: dependency manifest changed')
    expect(result.pnpmLog.trim()).toBe('install --silent')
  })

  it('does not install on a file checkout even when manifests changed', () => {
    const result = runHook({ branchCheckout: false, changeWorkspaceYaml: true })
    expect(result.status).toBe(0)
    expect(result.pnpmLog).toBe('')
    expect(result.stdout).not.toContain('pnpm install')
  })

  it('does not install when previous HEAD is the null SHA', () => {
    const result = runHook({
      branchCheckout: true,
      changeWorkspaceYaml: true,
      oldSha: '0'.repeat(40),
    })
    expect(result.status).toBe(0)
    expect(result.pnpmLog).toBe('')
    expect(result.stderr).not.toContain('fatal')
  })

  it('does not install on a branch checkout that only changes non-manifest files', () => {
    const result = runHook({ branchCheckout: true, changeWorkspaceYaml: false })
    expect(result.status).toBe(0)
    expect(result.pnpmLog).toBe('')
  })

  it('skips install when pnpm is missing and still exits 0', () => {
    const result = runHook({
      branchCheckout: true,
      changeWorkspaceYaml: true,
      omitPnpm: true,
    })
    expect(result.status).toBe(0)
    expect(result.stderr).toContain('pnpm not on PATH')
    expect(result.pnpmLog).toBe('')
  })

  it('warns and exits 0 when pnpm install fails', () => {
    const result = runHook({
      branchCheckout: true,
      changeWorkspaceYaml: true,
      pnpmExit: 19,
    })
    expect(result.status).toBe(0)
    expect(result.stderr).toContain('pnpm install failed (exit 19)')
    expect(result.pnpmLog.trim()).toBe('install --silent')
  })
})
