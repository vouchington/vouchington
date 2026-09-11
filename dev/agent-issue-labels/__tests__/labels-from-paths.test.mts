import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { labelsFromPaths, parseLabelsFromPathsArgs } from '../labels-from-paths.mts'

const repoRoot = resolve(import.meta.dirname, '../../..')
const labelerPath = resolve(repoRoot, '.github/labeler.yml')

describe('dev/agent-issue-labels/labels-from-paths.mts', () => {
  it('matches backend paths to the backend label', async () => {
    const labels = await labelsFromPaths(['backend/services/auth/index.mts'], labelerPath)
    expect(labels).toContain('backend')
  })

  it('matches backend/queues paths to both backend and mq labels', async () => {
    const labels = await labelsFromPaths(['backend/queues/email/worker.mts'], labelerPath)
    expect(labels).toContain('backend')
    expect(labels).toContain('mq')
  })

  it('matches .agents paths to the agents label', async () => {
    const labels = await labelsFromPaths(['.agents/skills/github-issue/SKILL.md'], labelerPath)
    expect(labels).toContain('agents')
  })

  it('matches scripts paths to the tooling label', async () => {
    const labels = await labelsFromPaths(['dev/agent-issue-labels/ensure-labels.mts'], labelerPath)
    expect(labels).toContain('tooling')
  })

  it('matches extended component paths to their existing labels', async () => {
    const cases: Array<[string, string]> = [
      ['.github/actions/setup/action.yml', 'github_actions'],
      ['.github/actionlint.yaml', 'github_actions'],
      ['.github/zizmor.yml', 'github_actions'],
      ['.claude/skills/example', 'agents'],
      ['.codex/config.toml', 'agents'],
      ['.grok/README.md', 'agents'],
      ['.cursor/README.md', 'agents'],
      ['.opencode/README.md', 'agents'],
      ['.pr-shepherd/config.yml', 'agents'],
      ['.husky/pre-commit', 'tooling'],
      ['ast-grep-rules/example.yml', 'tooling'],
      ['test-helpers/example.mts', 'testing'],
      ['ts-shared/utils/index.mts', 'ts-shared'],
      ['email-templates/welcome.tsx', 'email'],
      ['api-fixtures/v1/example.json', 'client-parity'],
      ['articles/example.md', 'content'],
      ['monitors/check.mts', 'reliability'],
    ]

    for (const [path, expectedLabel] of cases) {
      expect(await labelsFromPaths([path], labelerPath)).toContain(expectedLabel)
    }
  })

  it('returns no labels for unmatched paths', async () => {
    const labels = await labelsFromPaths(['some/unknown/path/file.txt'], labelerPath)
    expect(labels).toHaveLength(0)
  })

  it('deduplicates labels across multiple matching paths', async () => {
    const labels = await labelsFromPaths(
      ['backend/services/foo.mts', 'backend/services/bar.mts'],
      labelerPath,
    )
    const backendCount = labels.filter(l => l === 'backend').length
    expect(backendCount).toBe(1)
  })

  it('defaults the CLI to the current repository labeler', () => {
    expect(parseLabelsFromPathsArgs(['backend/service.mts'], '/repo')).toEqual({
      labelerPath: '/repo/.github/labeler.yml',
      paths: ['backend/service.mts'],
    })
  })

  it('accepts an explicit target repository labeler in the CLI', () => {
    expect(
      parseLabelsFromPathsArgs(
        ['backend/service.mts', '--labeler', 'target/labeler.yml', 'web/page.tsx'],
        '/tmp',
      ),
    ).toEqual({
      labelerPath: '/tmp/target/labeler.yml',
      paths: ['backend/service.mts', 'web/page.tsx'],
    })
  })

  it.each([
    [['--labeler'], '--labeler requires a path'],
    [['--labeler', '--unknown'], '--labeler requires a path'],
    [['--labeler', 'first.yml', '--labeler', 'second.yml'], '--labeler may only be specified once'],
    [['backend/service.mts', '--unknown'], 'unknown option: --unknown'],
  ])('rejects invalid CLI arguments %#', (argv, message) => {
    expect(() => parseLabelsFromPathsArgs(argv, '/tmp')).toThrow(message)
  })
})
