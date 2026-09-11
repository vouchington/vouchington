import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('husky-hooks', () => {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url))
  const huskyDir = `${repoRoot}/.husky`
  const githubActionsGuard = '[ "${GITHUB_ACTIONS:-}" = "true" ] && exit 0\n'

  function hookPath(name: string): string {
    return `${huskyDir}/${name}`
  }

  it('keeps commit-msg, post-checkout, post-merge, and post-rewrite as the active hooks', () => {
    const activeHooks = readdirSync(huskyDir)
      .filter((name: string) => !['CLAUDE.md', '_'].includes(name) && !name.endsWith('.test.mts'))
      .sort()

    expect(activeHooks).toEqual(['commit-msg', 'post-checkout', 'post-merge', 'post-rewrite'])
  })

  it('keeps every active hook as a no-op in GitHub Actions', () => {
    const activeHooks = ['commit-msg', 'post-checkout', 'post-merge', 'post-rewrite']

    for (const hook of activeHooks) {
      const expectedPrefix = `#!/bin/sh\n${githubActionsGuard}`
      expect(readFileSync(hookPath(hook), 'utf8').slice(0, expectedPrefix.length)).toBe(
        expectedPrefix,
      )
    }
  })

  it('validates commit messages and prints the cheap before-push commands', () => {
    expect(readFileSync(hookPath('commit-msg'), 'utf8')).toBe(`#!/bin/sh
${githubActionsGuard}set -e

pnpm exec commitlint --edit "$1"

cat <<'EOF'

Before pushing, run only these cheap commands. GitHub Actions is the full gate.
  pnpm exec oxlint --deny-warnings --type-aware <changed TS/MTS files>
  pnpm exec vitest run <directly changed test files> --bail=3
  git diff --name-only origin/main...HEAD
  pnpm exec oxfmt --check <changed supported files>
EOF
`)
    expect(statSync(hookPath('commit-msg')).mode & 0o111).not.toBe(0)
  })

  it('preserves the commitlint failure status', () => {
    const tmp = mkdtempSync(`${tmpdir()}/voucha-husky-`)

    try {
      const bin = `${tmp}/bin`
      mkdirSync(bin)
      writeFileSync(`${bin}/pnpm`, '#!/bin/sh\nexit 17\n')
      chmodSync(`${bin}/pnpm`, 0o755)
      const developerEnv = { ...process.env }
      delete developerEnv.GITHUB_ACTIONS

      const result = spawnSync('sh', ['-e', hookPath('commit-msg'), `${tmp}/COMMIT_EDITMSG`], {
        encoding: 'utf8',
        env: {
          ...developerEnv,
          PATH: `${bin}:${process.env.PATH ?? ''}`,
        },
      })

      expect(result.status).toBe(17)
      expect(result.stdout).not.toContain('Before pushing, run only these cheap commands')
    } finally {
      rmSync(tmp, { force: true, recursive: true })
    }
  })

  it('does not invoke hook payloads in GitHub Actions', () => {
    const tmp = mkdtempSync(`${tmpdir()}/voucha-husky-`)

    try {
      const bin = `${tmp}/bin`
      const executableLog = `${tmp}/executables.log`
      mkdirSync(bin)
      for (const executable of ['git', 'pnpm']) {
        writeFileSync(
          `${bin}/${executable}`,
          `#!/bin/sh\nprintf '%s\\n' ${JSON.stringify(executable)} >> ${JSON.stringify(executableLog)}\n`,
        )
        chmodSync(`${bin}/${executable}`, 0o755)
      }

      const hookArgs: Record<string, string[]> = {
        'commit-msg': [`${tmp}/COMMIT_EDITMSG`],
        'post-checkout': ['old', 'new', '1'],
        'post-merge': ['0'],
        'post-rewrite': ['rebase'],
      }

      for (const [hook, args] of Object.entries(hookArgs)) {
        const result = spawnSync('sh', ['-e', hookPath(hook), ...args], {
          encoding: 'utf8',
          env: {
            ...process.env,
            GITHUB_ACTIONS: 'true',
            PATH: `${bin}:${process.env.PATH ?? ''}`,
          },
        })

        expect(result.status).toBe(0)
        expect(result.stdout).toBe('')
        expect(result.stderr).toBe('')
      }

      expect(existsSync(executableLog)).toBe(false)
    } finally {
      rmSync(tmp, { force: true, recursive: true })
    }
  })

  it('keeps dependency-refresh hooks scoped to manifest changes', () => {
    const postRewrite = readFileSync(hookPath('post-rewrite'), 'utf8')
    const postMerge = readFileSync(hookPath('post-merge'), 'utf8')
    const postCheckout = readFileSync(hookPath('post-checkout'), 'utf8')

    expect(postRewrite).toContain('[ "$1" = "rebase" ] || exit 0')
    expect(postRewrite).toContain('git diff --name-only ORIG_HEAD HEAD')
    expect(postMerge).toContain('git diff --name-only ORIG_HEAD HEAD')
    expect(postCheckout).toContain('[ "$3" = "1" ] || exit 0')
    expect(postCheckout).toContain('0'.repeat(40))
    expect(postCheckout).toContain('git diff --name-only "$1" "$2" 2>/dev/null')
    expect(postRewrite).toContain('pnpm-lock\\.yaml|package\\.json|pnpm-workspace\\.yaml')
    expect(postMerge).toContain('pnpm-lock\\.yaml|package\\.json|pnpm-workspace\\.yaml')
    expect(postCheckout).toContain('pnpm-lock\\.yaml|package\\.json|pnpm-workspace\\.yaml')
    expect(postRewrite).toContain('pnpm install --silent')
    expect(postMerge).toContain('pnpm install --silent')
    expect(postCheckout).toContain('pnpm install --silent')
    expect(statSync(hookPath('post-checkout')).mode & 0o111).not.toBe(0)
  })
})
