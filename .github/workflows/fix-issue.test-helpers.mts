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
import { delimiter, join } from 'node:path'
import { parseGithubOutput } from '../../test-helpers/github-output.mts'

export function executeFixRequestExtraction(
  extractionScript: string,
  commentBody: string,
): Record<string, string> {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'fix-issue-extraction-'))
  const fakeBinDirectory = join(temporaryDirectory, 'bin')
  const githubOutputPath = join(temporaryDirectory, 'github-output')
  const githubSummaryPath = join(temporaryDirectory, 'github-summary')

  try {
    mkdirSync(fakeBinDirectory)
    const uuidgenPath = join(fakeBinDirectory, 'uuidgen')
    writeFileSync(uuidgenPath, '#!/bin/sh\nprintf "%s\\n" "12345678-abcd-4def-8123-123456789abc"\n')
    chmodSync(uuidgenPath, 0o755)

    execFileSync('/bin/bash', ['-c', extractionScript], {
      env: {
        ...process.env,
        COMMENT_BODY: commentBody,
        COMMENT_ID: '7657',
        GITHUB_OUTPUT: githubOutputPath,
        GITHUB_STEP_SUMMARY: githubSummaryPath,
        GITHUB_WORKSPACE: process.cwd(),
        PATH: `${fakeBinDirectory}${delimiter}${process.env['PATH'] ?? ''}`,
      },
      stdio: 'pipe',
    })

    return existsSync(githubOutputPath)
      ? parseGithubOutput(readFileSync(githubOutputPath, 'utf8'))
      : {}
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true })
  }
}
