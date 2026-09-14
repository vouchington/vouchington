import { chmod, writeFile } from 'node:fs/promises'

/** A Node script that logs its argv to `GH_CALLS_PATH` before running caller-supplied branches. */
export async function writeFakeGh(ghPath: string, ...branches: string[]): Promise<void> {
  await writeFile(
    ghPath,
    [
      '#!/usr/bin/env node',
      "import { appendFileSync, readFileSync } from 'node:fs'",
      'const args = process.argv.slice(2)',
      'appendFileSync(process.env.GH_CALLS_PATH, `${JSON.stringify(args)}\\n`)',
      ...branches,
    ].join('\n'),
  )
  await chmod(ghPath, 0o755)
}

export const FIXTURE_HEAD_BRANCH = 'fixture-head-branch'
export const FIXTURE_REMOTE_SHA = 'a'.repeat(40)

/** A fake `git` reporting a fixture head branch, optionally unpushed to the fixture remote. */
export async function writeFakeGit(
  gitPath: string,
  { branch = FIXTURE_HEAD_BRANCH, pushed = true }: { branch?: string; pushed?: boolean } = {},
): Promise<void> {
  await writeFile(
    gitPath,
    [
      '#!/usr/bin/env node',
      'const args = process.argv.slice(2)',
      "if (args[0] === 'branch' && args.includes('--show-current'))",
      `  console.log(${JSON.stringify(branch)})`,
      "else if (args[0] === 'ls-remote')",
      pushed
        ? `  console.log(${JSON.stringify(`${FIXTURE_REMOTE_SHA}\trefs/heads/${branch}`)})`
        : "  process.stdout.write('')",
      "else if (args[0] === 'rev-parse')",
      `  console.log(${JSON.stringify(FIXTURE_REMOTE_SHA)})`,
    ].join('\n'),
  )
  await chmod(gitPath, 0o755)
}
