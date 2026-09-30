import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { parseGithubOutput } from './github-output.mts'

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
