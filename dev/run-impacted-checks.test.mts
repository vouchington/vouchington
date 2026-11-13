import { spawnSync, execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseSelectedChecks, run } from './run-impacted-checks.mts'

const paths = ['backend/services/example.mts']
const validReport = {
  changed_files: paths,
  checks: [{ name: 'backend-contracts', kind: 'generic', command: ['node', 'ci/check.mts'] }],
  warnings: [],
  fallback_triggered: false,
}

describe('pre-push impact runner', () => {
  it('fails closed on warnings, missing paths, and unknown command shapes', () => {
    expect(() =>
      parseSelectedChecks(
        JSON.stringify({ ...validReport, warnings: [{ type: 'missed', message: 'coverage' }] }),
        paths,
      ),
    ).toThrow(/missed/)
    expect(() =>
      parseSelectedChecks(JSON.stringify({ ...validReport, changed_files: [] }), paths),
    ).toThrow(/every changed file/)
    expect(() =>
      parseSelectedChecks(JSON.stringify({ ...validReport, fallback_triggered: true }), paths),
    ).toThrow(/selected gates are unknown/)
    expect(() =>
      parseSelectedChecks(
        JSON.stringify({ ...validReport, checks: [{ name: 'unknown', kind: 'generic' }] }),
        paths,
      ),
    ).toThrow(/Unknown or duplicate selected check/)
  })

  it('reports a child exit failure even when that child prints success', () => {
    expect(() =>
      run(process.execPath, ['-e', 'console.log("success"); process.exitCode = 7']),
    ).toThrow(/exited 7/)
  })

  it('runs every selected command and propagates failure through the CLI', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'voucha-impacted-runner-'))
    try {
      const repo = join(scratch, 'repo')
      const bin = join(scratch, 'bin')
      const observed = join(scratch, 'manifest.txt')
      const marker = join(scratch, 'second-ran.txt')
      mkdirSync(join(repo, 'dev', 'localization'), { recursive: true })
      mkdirSync(bin)
      writeFileSync(join(repo, 'dev', 'localization', 'local-catalog.mts'), '')
      writeFileSync(join(repo, 'app.mts'), 'export const value = 1\n')
      writeFileSync(join(repo, 'keep-me.mts'), 'export const stable = true\n')
      const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' })
      git('init', '--quiet')
      git('config', 'user.name', 'Fixture')
      git('config', 'user.email', 'fixture@example.test')
      git('add', 'app.mts', 'keep-me.mts', 'dev/localization/local-catalog.mts')
      git('commit', '--quiet', '-m', 'fixture')
      git('update-ref', 'refs/remotes/origin/main', 'HEAD')
      writeFileSync(join(repo, 'app.mts'), 'export const value = 2\n')
      const fakePnpm = join(bin, 'pnpm')
      writeFileSync(
        fakePnpm,
        [
          '#!/usr/bin/env node',
          'const fs = require("node:fs")',
          'const args = process.argv.slice(2)',
          'if (args.join(" ").includes("exec no-mistakes impacted-checks") === false) process.exit(2)',
          'const manifest = fs.readFileSync(args[args.indexOf("--changed-files") + 1], "utf8")',
          `fs.writeFileSync(${JSON.stringify(observed)}, manifest)`,
          'console.log(JSON.stringify({',
          '  changed_files: manifest.trim().split("\\n"),',
          '  warnings: [], fallback_triggered: false,',
          '  checks: [',
          '    { name: "first-gate", kind: "generic", command: [process.execPath, "-e", "console.log(\\"success\\"); process.exitCode = 7"] },',
          `    { name: "second-gate", kind: "generic", command: [process.execPath, "-e", ${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`)}] },`,
          '  ],',
          '}))',
        ].join('\n'),
      )
      chmodSync(fakePnpm, 0o755)
      const script = fileURLToPath(new URL('./run-impacted-checks.mts', import.meta.url))
      const result = spawnSync(process.execPath, [script], {
        cwd: repo,
        env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` },
        encoding: 'utf8',
      })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('first-gate')
      expect(result.stderr).toContain('exited 7')
      expect(readFileSync(observed, 'utf8')).toBe('app.mts\n')
      expect(readFileSync(marker, 'utf8')).toBe('ran')

      git('mv', 'keep-me.mts', 'moved.mts')
      const renamed = spawnSync(process.execPath, [script], {
        cwd: repo,
        env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` },
        encoding: 'utf8',
      })
      expect(renamed.status).toBe(1)
      expect(readFileSync(observed, 'utf8')).toBe('app.mts\nkeep-me.mts\nmoved.mts\n')
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})
