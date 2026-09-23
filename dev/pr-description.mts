#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { createPullRequest, getDiffAgainstBase, runGh, runGit } from 'vouchington-tooling/gh-cli'
import { formatProjectAdvisoryReport } from 'vouchington-tooling/github-projects'
import { failValidation } from './pr-description/fail-validation.mts'
import { resolveBody } from './pr-description/body-source.mts'
import { formatReferencedIssueSummary } from './pr-description/referenced-issue-summary.mts'
import { parseBodyFileArg, parseCreateArgs } from './pr-description/argv.mts'
import {
  countDiffLineChanges,
  exceedsLargeDiffThreshold,
  formatLargeDiffRefusal,
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
import { readPullRequestPatch } from './pr-description/pull-request-patch.mts'
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
    const patchResult = await readPullRequestPatch(runGh, pr, target)
    if (patchResult.source === 'files-api') {
      process.stderr.write(
        'GitHub refused the oversized unified PR diff; supersession validation is using files API metadata and available per-file patches. Files whose patches GitHub omits receive deleted-file, route, rename, and package-manifest checks, but not removed-export content checks.\n',
      )
    }
    const repo = `${target.owner}/${target.repo}`
    const readPackageJson = createGhPackageJsonReader(runGh, repo, baseRefOid, headRefOid)
    validationOptions = {
      closureResolver: createIssueClosureResolver(runGh, target),
      milestoneAuditor: createMilestoneAuditor(runGh, repo),
      projectAuditor: createProjectAuditor(runGh, repo),
      supersessionAuditor: createSupersessionAuditor(
        runGh,
        repo,
        patchResult.patch,
        readPackageJson,
      ),
      targetPullRequest: target,
    }
  }
  const result = await validateBody(body, validationOptions)
  if (result.ok) {
    const summary = formatReferencedIssueSummary(result.referencedIssues)
    if (summary) process.stderr.write(summary)
    process.stderr.write(formatProjectAdvisoryReport(result.advisories))
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
    const changes = countDiffLineChanges(await diffAgainstMain)
    if (exceedsLargeDiffThreshold(changes)) {
      process.stderr.write(formatLargeDiffRefusal(changes))
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
