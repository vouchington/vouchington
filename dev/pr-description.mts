#!/usr/bin/env node

import { fileURLToPath } from 'node:url'
import { createPullRequest, getDiffAgainstBase, runGh, runGit } from 'vouchington-tooling/gh-cli'

import { resolveBody } from './pr-description/body-source.mts'
import { formatReferencedIssueSummary } from './pr-description/referenced-issue-summary.mts'
import { parseBodyFileArg, parseCreateArgs } from './pr-description/argv.mts'
import {
  countChangedDiffLines,
  formatLargeDiffRefusal,
  LARGE_DIFF_LINE_THRESHOLD,
} from './pr-description/diff-size.mts'
import { createMilestoneAuditor } from './pr-description/milestone-audit.mts'
import {
  createGhPackageJsonReader,
  createLocalPackageJsonReader,
} from './pr-description/package-json-source.mts'
import { createProjectAuditor } from './pr-description/project-audit.mts'
import {
  createIssueClosureResolver,
  createClosingIssueReferenceResolver,
  currentRepo,
  parsePullRequestIdentity,
} from './pr-description/related-issues.mts'
import { injectResolvedProvenance, resolveValidationBody } from './pr-description/provenance.mts'
import { resolveReconciledUpdateBody } from './pr-description/reconciled-update-body.mts'
import { createSupersessionAuditor } from './pr-description/supersession.mts'
import {
  parsePullRequestRefOids,
  resolveGhPackageJsonReader,
  writeSupersessionHints,
} from './pr-description/supersession-hints.mts'
import { withTempBodyFile } from './pr-description/temp-body-file.mts'
import { printPrDescriptionUsage } from './pr-description/usage.mts'
import {
  type IssueReferenceValidationOptions,
  validatePrBodyWithIssueReferences,
} from './pr-description/validate.mts'

function failValidation(errors: string[]): never {
  process.stderr.write('PR body validation failed:\n')
  for (const error of errors) process.stderr.write(`  - ${error}\n`)
  process.exit(1)
}

async function runValidate(argv: string[]): Promise<void> {
  const { bodyFile, remaining } = parseBodyFileArg(argv)
  if (remaining.some(arg => arg.startsWith('-')))
    throw new Error(`unknown option: ${remaining.find(arg => arg.startsWith('-'))}`)
  if (remaining.length > 1) throw new Error('validate accepts at most one PR')
  const pr = remaining[0]
  const body = await resolveValidationBody(await resolveBody({ bodyFile, pr }))
  let validationOptions: IssueReferenceValidationOptions = {}
  if (pr !== undefined) {
    const prJson = await runGh([
      'pr',
      'view',
      pr,
      '--json',
      'mergeCommit,number,state,url,baseRefOid,headRefOid',
    ])
    const target = parsePullRequestIdentity(prJson)
    const { baseRefOid, headRefOid } = parsePullRequestRefOids(prJson)
    const patch = await runGh(['pr', 'diff', pr])
    const repo = `${target.owner}/${target.repo}`
    const readPackageJson = createGhPackageJsonReader(runGh, repo, baseRefOid, headRefOid)
    validationOptions = {
      closureResolver: createIssueClosureResolver(runGh, target),
      milestoneAuditor: createMilestoneAuditor(runGh, repo),
      projectAuditor: createProjectAuditor(runGh, repo),
      supersessionAuditor: createSupersessionAuditor(runGh, repo, patch, readPackageJson),
      targetPullRequest: target,
    }
  }
  const result = await validateBody(body, validationOptions)
  if (result.ok) {
    const summary = formatReferencedIssueSummary(result.referencedIssues)
    if (summary) process.stderr.write(summary)
    process.stdout.write('PR body is valid.\n')
    return
  }
  failValidation(result.errors)
}

async function runCreate(argv: string[]): Promise<void> {
  const { bodyFile, remaining } = parseBodyFileArg(argv)
  const { acknowledgeLargeDiff, positionals, title } = parseCreateArgs(remaining)
  if (positionals.length > 0) throw new Error('create does not accept positional arguments')
  if (!title) {
    process.stderr.write(
      'Usage: node dev/pr-description.mts create --title <title> [--body-file <path>] [--acknowledge-large-diff]\n',
    )
    process.exit(1)
  }

  const body = await injectResolvedProvenance((await resolveBody({ bodyFile })).body)
  // Validate first so a bad body fails fast without an extra network round-trip.
  const result = await validateBody(body)
  if (!result.ok) failValidation(result.errors)
  const issueSummary = formatReferencedIssueSummary(result.referencedIssues)
  if (issueSummary) process.stderr.write(issueSummary)

  // Reused for both the size gate below and writeSupersessionHints — one `git diff` call.
  const diffAgainstMain = getDiffAgainstBase(runGit, 'origin/main')
  if (!acknowledgeLargeDiff) {
    const changedLines = countChangedDiffLines(await diffAgainstMain)
    if (changedLines > LARGE_DIFF_LINE_THRESHOLD) {
      process.stderr.write(formatLargeDiffRefusal(changedLines))
      process.exit(1)
    }
  }

  await writeSupersessionHints(
    runGh,
    currentRepo(runGh),
    diffAgainstMain,
    Promise.resolve(createLocalPackageJsonReader(runGit)),
  )

  const url = await withTempBodyFile(body, filePath =>
    createPullRequest(
      { runGh, runGit },
      { bodyFile: filePath, draft: true, title: title as string },
    ),
  )
  process.stdout.write(`${url}\n`)
}

async function runUpdate(argv: string[]): Promise<void> {
  const { bodyFile, remaining } = parseBodyFileArg(argv)
  if (remaining.some(arg => arg.startsWith('-')))
    throw new Error(`unknown option: ${remaining.find(arg => arg.startsWith('-'))}`)
  if (remaining.length > 1) throw new Error('update requires exactly one PR')
  const pr = remaining[0]
  if (!pr) {
    process.stderr.write(
      'Usage: node dev/pr-description.mts update <pr-number> [--body-file <path>]\n',
    )
    process.exit(1)
  }

  const reconciled = await resolveReconciledUpdateBody(bodyFile, pr)
  if (!reconciled.ok) {
    process.stderr.write(`PR body update rejected:\n  ${reconciled.error}\n`)
    process.exit(1)
  }
  const body = await injectResolvedProvenance(reconciled.body)
  const result = await validateBody(body)
  if (!result.ok) failValidation(result.errors)
  const issueSummary = formatReferencedIssueSummary(result.referencedIssues)
  if (issueSummary) process.stderr.write(issueSummary)

  await writeSupersessionHints(
    runGh,
    currentRepo(runGh),
    runGh(['pr', 'diff', pr]),
    resolveGhPackageJsonReader(runGh, pr),
  )

  await withTempBodyFile(body, async filePath => {
    await runGh(['pr', 'edit', pr, '--body-file', filePath])
  })
  process.stdout.write('PR description updated.\n')
}

const resolveIssueReference = createClosingIssueReferenceResolver(runGh)

async function validateBody(body: string, options: IssueReferenceValidationOptions = {}) {
  return validatePrBodyWithIssueReferences(body, resolveIssueReference, options)
}

function main(): Promise<void> {
  const [subcommand, ...rest] = process.argv.slice(2)
  if ((subcommand === '-h' || subcommand === '--help') && rest.length === 0) {
    printPrDescriptionUsage(process.stdout)
    return Promise.resolve()
  }
  if (
    rest.length === 1 &&
    (rest[0] === '-h' || rest[0] === '--help') &&
    ['validate', 'create', 'update'].includes(subcommand ?? '')
  ) {
    printPrDescriptionUsage(process.stdout)
    return Promise.resolve()
  }
  if (rest.includes('-h') || rest.includes('--help')) throw new Error('help must be used by itself')
  if (subcommand === 'validate') return runValidate(rest)
  if (subcommand === 'create') return runCreate(rest)
  if (subcommand === 'update') return runUpdate(rest)
  printPrDescriptionUsage(process.stderr)
  process.exit(1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  })
}
