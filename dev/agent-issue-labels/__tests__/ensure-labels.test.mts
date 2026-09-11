import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { labelColor, labelDescription } from '../ensure-labels.mts'

describe('dev/agent-issue-labels/ensure-labels.mts', () => {
  const execFileAsync = promisify(execFile)
  const scriptPath = fileURLToPath(new URL('../ensure-labels.mts', import.meta.url))
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('uses distinct colors and descriptions for the four canonical priorities', () => {
    expect(labelColor('priority: critical')).toBe('b60205')
    expect(labelColor('priority: high')).toBe('d93f0b')
    expect(labelColor('priority: medium')).toBe('fbca04')
    expect(labelColor('priority: low')).toBe('0e8a16')
    expect(labelDescription('priority: critical')).toBe(
      'Immediate incident, exploitable vulnerability, or release blocker.',
    )
    expect(labelDescription('priority: high')).toBe('Material risk or user impact; schedule next.')
    expect(labelDescription('priority: medium')).toBe('Normal actionable priority and default.')
    expect(labelDescription('priority: low')).toBe('Useful but not time-sensitive.')
  })

  it('uses nonempty defaults for component and sub-labels', () => {
    expect(labelColor('agents')).toBe('EDEDED')
    expect(labelColor('workflow')).toBe('EDEDED')
    expect(() => labelColor('priority: very high')).toThrow('unsupported priority label')
    expect(labelDescription('agents')).toBe('Repository issue classification: agents.')
  })

  it('fetches labels once, preserves existing metadata, and creates only missing labels', async () => {
    const { argsPath, binDir, existingLabelsJson } = await makeFakeGh([
      { name: 'agents', description: 'Existing description that must remain unchanged.' },
    ])
    const result = await execFileAsync(
      process.execPath,
      [scriptPath, 'priority: medium', 'agents'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          GH_ARGS_FILE: argsPath,
          GH_EXISTING_LABELS: existingLabelsJson,
          PATH: `${binDir}:${process.env.PATH}`,
        },
      },
    )

    expect(result.stdout).toBe('priority: medium\nagents\n')
    const calls = await readGhCalls(argsPath)
    expect(calls).toEqual([
      [
        'api',
        '--paginate',
        '--slurp',
        '-X',
        'GET',
        'repos/{owner}/{repo}/labels',
        '-F',
        'per_page=100',
      ],
      [
        'label',
        'create',
        'priority: medium',
        '--color',
        'fbca04',
        '--description',
        'Normal actionable priority and default.',
      ],
    ])
  })

  it('verifies labels with a repository override', async () => {
    const { argsPath, binDir, existingLabelsJson } = await makeFakeGh()
    const result = await execFileAsync(
      process.execPath,
      [scriptPath, 'priority: low', 'workflow', '--repo', 'owner/repo'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          GH_ARGS_FILE: argsPath,
          GH_EXISTING_LABELS: existingLabelsJson,
          PATH: `${binDir}:${process.env.PATH}`,
        },
      },
    )

    expect(result.stdout).toBe('priority: low\nworkflow\n')
    const calls = await readGhCalls(argsPath)
    expect(calls).toEqual([
      [
        'api',
        '--paginate',
        '--slurp',
        '-X',
        'GET',
        'repos/owner/repo/labels',
        '-F',
        'per_page=100',
      ],
      [
        'label',
        'create',
        'priority: low',
        '--color',
        '0e8a16',
        '--description',
        'Useful but not time-sensitive.',
        '--repo',
        'owner/repo',
      ],
      [
        'label',
        'create',
        'workflow',
        '--color',
        'EDEDED',
        '--description',
        'Repository issue classification: workflow.',
        '--repo',
        'owner/repo',
      ],
    ])
  })

  it('updates existing label metadata only when explicitly requested', async () => {
    const { argsPath, binDir, existingLabelsJson } = await makeFakeGh([{ name: 'priority: high' }])
    const result = await execFileAsync(
      process.execPath,
      [scriptPath, '--update', 'priority: high', '--repo', 'owner/repo'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          GH_ARGS_FILE: argsPath,
          GH_EXISTING_LABELS: existingLabelsJson,
          PATH: `${binDir}:${process.env.PATH}`,
        },
      },
    )

    expect(result.stdout).toBe('priority: high\n')
    expect(await readGhCalls(argsPath)).toEqual([
      [
        'api',
        '--paginate',
        '--slurp',
        '-X',
        'GET',
        'repos/owner/repo/labels',
        '-F',
        'per_page=100',
      ],
      [
        'label',
        'create',
        'priority: high',
        '--color',
        'd93f0b',
        '--description',
        'Material risk or user impact; schedule next.',
        '--force',
        '--repo',
        'owner/repo',
      ],
    ])
  })

  it('accepts a label created concurrently without updating its metadata', async () => {
    const { argsPath, binDir, existingLabelsJson } = await makeFakeGh([], true)
    const result = await execFileAsync(process.execPath, [scriptPath, 'workflow'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GH_ARGS_FILE: argsPath,
        GH_EXISTING_LABELS: existingLabelsJson,
        GH_FAIL_CREATE_ONCE: 'true',
        PATH: `${binDir}:${process.env.PATH}`,
      },
    })

    expect(result.stdout).toBe('workflow\n')
    expect(await readGhCalls(argsPath)).toEqual([
      [
        'api',
        '--paginate',
        '--slurp',
        '-X',
        'GET',
        'repos/{owner}/{repo}/labels',
        '-F',
        'per_page=100',
      ],
      [
        'label',
        'create',
        'workflow',
        '--color',
        'EDEDED',
        '--description',
        'Repository issue classification: workflow.',
      ],
      ['api', 'repos/{owner}/{repo}/labels/workflow', '--silent'],
    ])
  })

  it('prints inert help and rejects malformed arguments before invoking gh', async () => {
    const { argsPath, binDir, existingLabelsJson } = await makeFakeGh()
    const env = {
      ...process.env,
      GH_ARGS_FILE: argsPath,
      GH_EXISTING_LABELS: existingLabelsJson,
      PATH: `${binDir}:${process.env.PATH}`,
    }
    const help = await execFileAsync(process.execPath, [scriptPath, '--help'], { env })
    expect(help.stdout).toContain('Usage:')

    for (const args of [
      ['--repo'],
      ['--wat'],
      ['--update', '--update', 'label'],
      ['label', '--help'],
      ['--repo', 'a/b'],
      ['priority: very high'],
    ]) {
      await expect(
        execFileAsync(process.execPath, [scriptPath, ...args], { env }),
      ).rejects.toMatchObject({ code: 1 })
    }
    await expect(readFile(argsPath, 'utf8')).rejects.toThrow(/ENOENT/)
  })

  async function makeFakeGh(
    existingLabels: Array<{ name: string; description?: string }> = [],
    concurrentLabelExists = false,
  ): Promise<{
    argsPath: string
    binDir: string
    existingLabelsJson: string
  }> {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-ensure-labels-'))
    testDirs.push(dir)
    const binDir = join(dir, 'bin')
    const argsPath = join(dir, 'gh-args.jsonl')
    await mkdir(binDir)
    const ghPath = join(binDir, 'gh')
    await writeFile(
      ghPath,
      [
        '#!/usr/bin/env node',
        "import { appendFileSync } from 'node:fs'",
        'appendFileSync(process.env.GH_ARGS_FILE, `${JSON.stringify(process.argv.slice(2))}\\n`)',
        "if (process.argv[2] === 'label' && process.env.GH_FAIL_CREATE_ONCE === 'true') process.exit(1)",
        `if (process.argv[2] === 'api' && process.argv.includes('--paginate')) process.stdout.write(\`[\${process.env.GH_EXISTING_LABELS ?? '[]'}]\`)`,
        `if (process.argv[2] === 'api' && !process.argv.includes('--paginate')) process.exit(${concurrentLabelExists ? 0 : 1})`,
      ].join('\n'),
    )
    await chmod(ghPath, 0o755)
    return { argsPath, binDir, existingLabelsJson: JSON.stringify(existingLabels) }
  }

  async function readGhCalls(path: string): Promise<string[][]> {
    const raw = await readFile(path, 'utf8')
    return raw
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as string[])
  }
})
