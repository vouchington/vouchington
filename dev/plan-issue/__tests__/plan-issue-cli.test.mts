import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GITHUB_BODY_MAX_CHARACTERS, validateGitHubBodyLength } from 'vouchington-tooling/gh-cli'
import { describe, expect, it } from 'vitest'

import { executePlanIssue, parsePlanIssueArgs, withPrivateBodySnapshot } from '../../plan-issue.mts'
import { buildPlanIssueCreateArgs } from '../validate.mts'
import { VALID_PLAN_BODY } from '../../test-helpers/plan-issue/valid-plan-body.mts'

const VALID_BODY = VALID_PLAN_BODY
const acceptMermaid = () => Promise.resolve([])

describe('Plan issue CLI', () => {
  it.each(['-h', '--help'])('prints standalone %s without touching dependencies', async help => {
    let touched = false
    const touch = () => {
      touched = true
      return Promise.resolve('')
    }
    const output = await executePlanIssue([help], {
      readBody: touch,
      resolveRepo: touch,
      runGh: touch,
      validateMermaid: () => {
        touched = true
        return Promise.resolve([])
      },
      withBodySnapshot: (_body, fn) => fn('/tmp/body.md'),
    })
    expect(output).toContain('Usage:')
    expect(touched).toBe(false)
  })

  it('rejects inline and stdin body sources', () => {
    expect(() => parsePlanIssueArgs(['--title', 'Plan: x', '--body-file', '-'])).toThrow(
      'non-stdin',
    )
    expect(() => parsePlanIssueArgs(['--title', 'Plan: x', '--body', VALID_BODY])).toThrow(
      'Unknown or incomplete option: --body',
    )
  })

  it('parses an optional target repository', () => {
    expect(
      parsePlanIssueArgs([
        '--title',
        'Plan: x',
        '--body-file',
        '/tmp/body.md',
        '--repo',
        'owner/repo',
      ]),
    ).toEqual({
      bodyFile: '/tmp/body.md',
      labels: [],
      repo: 'owner/repo',
      title: 'Plan: x',
    })
  })

  it('rejects missing or duplicate target repositories', () => {
    expect(() => parsePlanIssueArgs(['--repo'])).toThrow('--repo requires an owner/repo value')
    expect(() => parsePlanIssueArgs(['--repo', 'owner/one', '--repo', 'owner/two'])).toThrow(
      '--repo may be provided only once',
    )
  })

  it.each([
    [
      '--title',
      ['--title', '--body-file', '/tmp/body.md'],
      'Unknown or incomplete option: --title',
    ],
    [
      '--body-file',
      ['--title', 'Plan: x', '--body-file', '--label', 'docs'],
      'Unknown or incomplete option: --body-file',
    ],
    [
      '--label',
      ['--title', 'Plan: x', '--body-file', '/tmp/body.md', '--label', '--repo', 'owner/repo'],
      'Unknown or incomplete option: --label',
    ],
    [
      '--repo',
      ['--title', 'Plan: x', '--body-file', '/tmp/body.md', '--repo', '--label', 'docs'],
      '--repo requires an owner/repo value',
    ],
  ])('rejects %s when the next token is another option', (_option, argv, error) => {
    expect(() => parsePlanIssueArgs(argv)).toThrow(error)
  })

  it('validates before invoking GitHub', async () => {
    let invokedGitHub = false
    await expect(
      executePlanIssue(['create', '--title', 'Plan: x', '--body-file', '/tmp/body.md'], {
        readBody: () => Promise.resolve('invalid'),
        resolveRepo: () => {
          invokedGitHub = true
          return Promise.resolve('jonathanong/filaments')
        },
        runGh: () => {
          invokedGitHub = true
          return Promise.resolve('')
        },
        validateMermaid: acceptMermaid,
        withBodySnapshot: withPrivateBodySnapshot,
      }),
    ).rejects.toThrow('Plan issue validation failed')
    expect(invokedGitHub).toBe(false)
  })

  it.each([
    ['validate', ['validate', '--title', 'Plan: x', '--body-file', '/tmp/body.md']],
    ['create', ['create', '--title', 'Plan: x', '--body-file', '/tmp/body.md']],
  ])('rejects an oversized Plan %s before any GitHub work', async (_subcommand, args) => {
    const currentLength = validateGitHubBodyLength(VALID_BODY).characterCount
    const body = `${VALID_BODY}${'x'.repeat(GITHUB_BODY_MAX_CHARACTERS + 1 - currentLength)}`
    let invokedGitHub = false
    await expect(
      executePlanIssue(args, {
        readBody: () => Promise.resolve(body),
        resolveRepo: () => {
          invokedGitHub = true
          return Promise.resolve('jonathanong/filaments')
        },
        runGh: () => {
          invokedGitHub = true
          return Promise.resolve('')
        },
        validateMermaid: acceptMermaid,
        withBodySnapshot: withPrivateBodySnapshot,
      }),
    ).rejects.toThrow(/65,537 Unicode characters/)
    expect(invokedGitHub).toBe(false)
  })

  it('forwards the parsed target repository when creating', async () => {
    let submittedArgs: string[] = []
    await executePlanIssue(
      ['create', '--title', 'Plan: x', '--body-file', '/tmp/body.md', '--repo', 'owner/repo'],
      {
        readBody: () =>
          Promise.resolve(
            VALID_BODY.replace('jonathanong/filaments/issues/7390', 'owner/repo/issues/7390'),
          ),
        resolveRepo: () => Promise.resolve('not/used'),
        runGh: args => {
          submittedArgs = args
          return Promise.resolve('created\n')
        },
        validateMermaid: acceptMermaid,
        withBodySnapshot: (_body, fn) => fn('/tmp/private-body.md'),
      },
    )
    expect(submittedArgs).toContain('--repo')
    expect(submittedArgs).toContain('owner/repo')
  })

  it('rejects a source URL outside the explicit target repository', async () => {
    await expect(
      executePlanIssue(
        ['create', '--title', 'Plan: x', '--body-file', '/tmp/body.md', '--repo', 'owner/repo'],
        {
          readBody: () => Promise.resolve(VALID_BODY),
          resolveRepo: () => Promise.resolve('not/used'),
          runGh: () => Promise.resolve('created\n'),
          validateMermaid: acceptMermaid,
          withBodySnapshot: (_body, fn) => fn('/tmp/private-body.md'),
        },
      ),
    ).rejects.toThrow('same issues')
  })

  it('submits a private snapshot of the validated bytes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'plan-issue-test-'))
    const callerPath = join(directory, 'caller.md')
    try {
      await writeFile(callerPath, VALID_BODY)
      let submittedPath = ''
      let submittedBody = ''
      await executePlanIssue(['create', '--title', 'Plan: x', '--body-file', callerPath], {
        readBody: path => readFile(path, 'utf8'),
        resolveRepo: () => Promise.resolve('jonathanong/filaments'),
        runGh: async args => {
          await writeFile(callerPath, 'mutated after validation')
          submittedPath = args[args.indexOf('--body-file') + 1] ?? ''
          submittedBody = await readFile(submittedPath, 'utf8')
          return 'created\n'
        },
        validateMermaid: acceptMermaid,
        withBodySnapshot: withPrivateBodySnapshot,
      })
      expect(submittedPath).not.toBe(callerPath)
      expect(submittedBody).toBe(VALID_BODY)
      await expect(readFile(submittedPath, 'utf8')).rejects.toThrow('ENOENT')
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('binds omitted-repo references to the resolved target repository', async () => {
    await expect(
      executePlanIssue(['validate', '--title', 'Plan: x', '--body-file', '/tmp/body.md'], {
        readBody: () =>
          Promise.resolve(
            VALID_BODY.replace('jonathanong/filaments/issues/7390', 'owner/two/issues/7390'),
          ),
        resolveRepo: () => Promise.resolve('owner/one'),
        runGh: () => Promise.resolve(''),
        validateMermaid: acceptMermaid,
        withBodySnapshot: (_body, fn) => fn('/tmp/private-body.md'),
      }),
    ).rejects.toThrow('same issues')
  })

  it('rejects Mermaid parser errors before invoking GitHub', async () => {
    let resolvedRepository = false
    await expect(
      executePlanIssue(['validate', '--title', 'Plan: x', '--body-file', '/tmp/body.md'], {
        readBody: () => Promise.resolve(VALID_BODY),
        resolveRepo: () => {
          resolvedRepository = true
          return Promise.resolve('jonathanong/filaments')
        },
        runGh: () => Promise.resolve(''),
        validateMermaid: () => Promise.resolve(['invalid Mermaid syntax']),
        withBodySnapshot: (_body, fn) => fn('/tmp/private-body.md'),
      }),
    ).rejects.toThrow('Mermaid validation failed')
    expect(resolvedRepository).toBe(false)
  })

  it('builds a body-file-only create command and deduplicates labels', () => {
    expect(buildPlanIssueCreateArgs('Plan: x', '/tmp/body.md', ['docs', 'plan', 'docs'])).toEqual([
      'issue',
      'create',
      '--title',
      'Plan: x',
      '--body-file',
      '/tmp/body.md',
      '--label',
      'plan',
      '--label',
      'docs',
    ])
  })

  it('adds the target repository to the create command', () => {
    expect(buildPlanIssueCreateArgs('Plan: x', '/tmp/body.md', ['docs'], 'owner/repo')).toEqual([
      'issue',
      'create',
      '--repo',
      'owner/repo',
      '--title',
      'Plan: x',
      '--body-file',
      '/tmp/body.md',
      '--label',
      'plan',
      '--label',
      'docs',
    ])
  })
})
