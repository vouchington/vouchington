import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseGithubOutput } from '../../test-helpers/github-output.mts'

const MALICIOUS_PR_TITLE = [
  'Preserve this entire title',
  'PR_TITLE',
  'pr_url=https://attacker.invalid/forged',
  'injected_output=true',
].join('\n')

export function executeTrustedVersionStep(stepRun: string) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'shepherd-version-'))
  const githubOutputPath = join(temporaryDirectory, 'github-output')
  const installedVersion = (
    JSON.parse(readFileSync('node_modules/pr-shepherd/package.json', 'utf8')) as {
      version: string
    }
  ).version

  try {
    const stdout = execFileSync('bash', ['-c', stepRun], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: githubOutputPath },
    })
    return {
      githubOutput: readFileSync(githubOutputPath, 'utf8'),
      installedVersion,
      stdout,
    }
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true })
  }
}

export function executeGateWithTitle(
  gateRun: string,
  prTitle = MALICIOUS_PR_TITLE,
  options: {
    commentBody?: string
    headRepo?: string
    prFields?: Record<string, unknown>
  } = {},
) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'shepherd-gate-'))
  const fakeBinDirectory = join(temporaryDirectory, 'bin')
  const githubOutputPath = join(temporaryDirectory, 'github-output')
  const prJsonPath = join(temporaryDirectory, 'pr.json')
  const ghLogPath = join(temporaryDirectory, 'gh.log')
  const trustedPrUrl = 'https://github.com/jonathanong/filaments/pull/7611'

  try {
    mkdirSync(fakeBinDirectory)
    writeFileSync(
      join(fakeBinDirectory, 'gh'),
      [
        '#!/bin/sh',
        'if [ "$1" = "api" ]; then cat "$FAKE_PR_JSON"; exit 0; fi',
        'if [ "$1" = "issue" ] && [ "$2" = "comment" ]; then printf "%s\\n" "$*" >> "$FAKE_GH_LOG"; exit 0; fi',
        'exit 1',
        '',
      ].join('\n'),
    )
    chmodSync(join(fakeBinDirectory, 'gh'), 0o755)
    writeFileSync(
      join(fakeBinDirectory, 'uuidgen'),
      '#!/bin/sh\nprintf "%s\\n" "12345678-abcd-4def-8123-123456789abc"\n',
    )
    chmodSync(join(fakeBinDirectory, 'uuidgen'), 0o755)
    writeFileSync(
      prJsonPath,
      JSON.stringify({
        ...options.prFields,
        head: {
          ref: 'fix/pr-title-output',
          sha: '1111111111111111111111111111111111111111',
          repo: { full_name: options.headRepo ?? 'jonathanong/filaments' },
        },
        html_url: trustedPrUrl,
        title: prTitle,
      }),
    )

    execFileSync('bash', ['-c', gateRun], {
      env: {
        ...process.env,
        COMMENT_BODY: options.commentBody ?? '/shepherd',
        FAKE_GH_LOG: ghLogPath,
        FAKE_PR_JSON: prJsonPath,
        GITHUB_OUTPUT: githubOutputPath,
        GITHUB_REPOSITORY: 'jonathanong/filaments',
        GITHUB_WORKSPACE: process.cwd(),
        PATH: `${fakeBinDirectory}:${process.env['PATH'] ?? ''}`,
        PR_NUMBER: '7611',
      },
    })

    const githubOutput = readFileSync(githubOutputPath, 'utf8')
    return {
      ghLog: existsSync(ghLogPath) ? readFileSync(ghLogPath, 'utf8') : '',
      githubOutput,
      outputs: parseGithubOutput(githubOutput),
      prTitle,
      trustedPrUrl,
    }
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true })
  }
}
