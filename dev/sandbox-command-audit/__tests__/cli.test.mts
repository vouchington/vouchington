import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { parseArgs, run } from '../../sandbox-command-audit.mts'

const testDirs: string[] = []

// Canonicalized up front: repo-scope.mts's resolveRepoRoots now resolves every root
// (explicit or auto-discovered) through realpath before comparison, so on a machine
// where the OS temp dir is itself a symlink (macOS: /var -> /private/var), a raw
// mkdtemp path would never match the tool's own canonicalized Scope:/repoRoots output.
async function makeTempDir(): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'sandbox-command-audit-cli-')))
  testDirs.push(dir)
  return dir
}

async function writeSettings(dir: string, contents: string): Promise<string> {
  const settingsPath = join(dir, 'settings.json')
  await writeFile(settingsPath, contents, 'utf8')
  return settingsPath
}

describe('parseArgs', () => {
  it('resolves defaults from HOME and cwd when no flags are given', () => {
    const options = parseArgs([], { HOME: '/home/tester' })
    expect(options).toEqual({
      projectsDir: join('/home/tester', '.claude', 'projects'),
      codexSessionsDir: join('/home/tester', '.codex', 'sessions'),
      settingsPath: join(process.cwd(), '.claude', 'settings.json'),
      maxFilesPerRoot: 50,
      json: false,
      raw: false,
    })
  })

  it('falls back to os.homedir() when HOME is unset in the given env', () => {
    const options = parseArgs([], {})
    expect(options.projectsDir.endsWith(join('.claude', 'projects'))).toBe(true)
  })

  it('parses --json and --raw as boolean flags', () => {
    const options = parseArgs(['--json', '--raw'], {})
    expect(options.json).toBe(true)
    expect(options.raw).toBe(true)
  })

  it('parses --limit and --since as positive integers', () => {
    const options = parseArgs(['--limit', '10', '--since', '7'], {})
    expect(options.maxFilesPerRoot).toBe(10)
    expect(options.sinceDays).toBe(7)
  })

  it('rejects --limit with a non-positive or non-numeric value', () => {
    expect(() => parseArgs(['--limit', '0'], {})).toThrow('--limit requires a positive integer')
    expect(() => parseArgs(['--limit', 'abc'], {})).toThrow('--limit requires a positive integer')
  })

  it('rejects --since with a non-positive or non-numeric value', () => {
    expect(() => parseArgs(['--since', '0'], {})).toThrow('--since requires a positive integer')
    expect(() => parseArgs(['--since', 'abc'], {})).toThrow('--since requires a positive integer')
  })

  // #8204 — mirrors the --session-id convention shared by this repo's other session-scoped
  // CLIs (e.g. dev/session-friction/report.mts), reusing agent-session-id/valid-id.mts rather
  // than re-deriving the format check.
  it('parses --session-id and sets it on the returned options', () => {
    const options = parseArgs(['--session-id', 'abc-123_DEF'], {})
    expect(options.sessionId).toBe('abc-123_DEF')
  })

  it('rejects --session-id with an invalid format', () => {
    expect(() => parseArgs(['--session-id', 'not a valid id'], {})).toThrow(
      '--session-id has an invalid format: not a valid id',
    )
  })

  it('leaves sessionId undefined when --session-id is not passed', () => {
    const options = parseArgs([], {})
    expect(options.sessionId).toBeUndefined()
  })

  it('leaves repoRoots undefined when --repo-root is not passed', () => {
    const options = parseArgs([], {})
    expect(options.repoRoots).toBeUndefined()
  })

  it('parses a single --repo-root value', () => {
    const options = parseArgs(['--repo-root', '/repo/one'], {})
    expect(options.repoRoots).toEqual(['/repo/one'])
  })

  it('parses repeated --repo-root flags into an array, preserving order', () => {
    const options = parseArgs(['--repo-root', '/repo/one', '--repo-root', '/repo/two'], {})
    expect(options.repoRoots).toEqual(['/repo/one', '/repo/two'])
  })

  it('rejects --repo-root with an empty value', () => {
    expect(() => parseArgs(['--repo-root', ''], {})).toThrow('--repo-root requires a value')
  })

  it('parses --projects-dir, --codex-sessions-dir, --settings-path overrides', () => {
    const options = parseArgs(
      [
        '--projects-dir',
        '/custom/projects',
        '--codex-sessions-dir',
        '/custom/codex',
        '--settings-path',
        '/custom/settings.json',
      ],
      {},
    )
    expect(options.projectsDir).toBe('/custom/projects')
    expect(options.codexSessionsDir).toBe('/custom/codex')
    expect(options.settingsPath).toBe('/custom/settings.json')
  })

  it('rejects a flag needing a value when the value is missing or looks like another flag', () => {
    for (const flag of [
      '--limit',
      '--since',
      '--session-id',
      '--projects-dir',
      '--codex-sessions-dir',
      '--settings-path',
      '--repo-root',
    ]) {
      expect(() => parseArgs([flag])).toThrow(`Option '${flag} <value>' argument missing`)
      expect(() => parseArgs([flag, '--json'])).toThrow(`Option '${flag}' argument is ambiguous`)
      expect(() => parseArgs([flag, ''])).toThrow(`${flag} requires a value`)
    }
  })

  it('rejects an unrecognized flag', () => {
    expect(() => parseArgs(['--jsno'])).toThrow("Unknown option '--jsno'")
  })
})

describe('run', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('scans, classifies, and renders a markdown report end to end', async () => {
    const dir = await makeTempDir()
    const projectsDir = join(dir, 'claude-projects')
    const codexSessionsDir = join(dir, 'codex-sessions')
    // A session file lives one directory below projectsDir (the Claude project
    // directory, e.g. proj-a) — repo scoping resolves cwd by globbing top-level
    // session files within that project directory, so the fixture must match that
    // real two-level shape, not a flat file directly under projectsDir.
    await mkdir(join(projectsDir, 'proj-a'), { recursive: true })
    await mkdir(codexSessionsDir, { recursive: true })
    await writeFile(
      join(projectsDir, 'proj-a', 'session-1.jsonl'),
      `${JSON.stringify({
        type: 'assistant',
        cwd: dir,
        message: {
          content: [
            {
              type: 'tool_use',
              id: 't1',
              name: 'Bash',
              input: { command: 'git push origin main', dangerouslyDisableSandbox: true },
            },
          ],
        },
      })}\n`,
      'utf8',
    )
    const settingsPath = await writeSettings(dir, '{}')

    const output = await run(
      [
        '--projects-dir',
        projectsDir,
        '--codex-sessions-dir',
        codexSessionsDir,
        '--settings-path',
        settingsPath,
        '--limit',
        '10',
        '--repo-root',
        dir,
      ],
      {},
    )
    expect(output).toContain('=== Sandbox Command Audit ===')
    expect(output).toContain(`Scope: ${dir} — 1 Claude / 0 Codex files scanned`)
    expect(output).toContain('## 3. Escalation pressure')
    expect(output).toContain('  - git push (1)')
  })

  it('renders an unavailable status block when the settings file cannot be parsed', async () => {
    const dir = await makeTempDir()
    const projectsDir = join(dir, 'claude-projects')
    const codexSessionsDir = join(dir, 'codex-sessions')
    await mkdir(projectsDir, { recursive: true })
    await mkdir(codexSessionsDir, { recursive: true })
    const settingsPath = await writeSettings(dir, 'not json')

    const output = await run(
      [
        '--projects-dir',
        projectsDir,
        '--codex-sessions-dir',
        codexSessionsDir,
        '--settings-path',
        settingsPath,
        '--repo-root',
        dir,
      ],
      {},
    )
    expect(output).toContain('=== Sandbox Command Audit ===')
    expect(output).toContain('Status: unavailable (')
  })

  it('renders JSON output when --json is passed', async () => {
    const dir = await makeTempDir()
    const projectsDir = join(dir, 'claude-projects')
    const codexSessionsDir = join(dir, 'codex-sessions')
    await mkdir(projectsDir, { recursive: true })
    await mkdir(codexSessionsDir, { recursive: true })
    const settingsPath = await writeSettings(dir, '{}')

    const output = await run(
      [
        '--projects-dir',
        projectsDir,
        '--codex-sessions-dir',
        codexSessionsDir,
        '--settings-path',
        settingsPath,
        '--repo-root',
        dir,
        '--json',
      ],
      {},
    )
    const parsed: unknown = JSON.parse(output)
    expect(parsed).toMatchObject({ claudeFilesScanned: 0, codexFilesScanned: 0, repoRoots: [dir] })
  })

  // #8204 — end to end: --session-id must actually narrow which files get scanned, not
  // just parse without error.
  it('scans only the matching session when --session-id is passed', async () => {
    const dir = await makeTempDir()
    const projectsDir = join(dir, 'claude-projects', 'proj-a')
    const codexSessionsDir = join(dir, 'codex-sessions')
    await mkdir(projectsDir, { recursive: true })
    await mkdir(codexSessionsDir, { recursive: true })
    await writeFile(join(projectsDir, 'target-session.jsonl'), '{}\n', 'utf8')
    await writeFile(join(projectsDir, 'other-session.jsonl'), '{}\n', 'utf8')
    const settingsPath = await writeSettings(dir, '{}')

    const output = await run(
      [
        '--projects-dir',
        projectsDir,
        '--codex-sessions-dir',
        codexSessionsDir,
        '--settings-path',
        settingsPath,
        '--repo-root',
        dir,
        '--session-id',
        'target-session',
        '--json',
      ],
      {},
    )
    const parsed: unknown = JSON.parse(output)
    expect(parsed).toMatchObject({ claudeFilesScanned: 1, codexFilesScanned: 0 })
  })
})
