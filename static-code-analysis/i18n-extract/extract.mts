#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { mergeExtractedEntries } from './catalog.mts'
import { listCandidateFiles } from './file-list.mts'
import { type CatalogEntry, type RewriteReport, rewriteFile } from './rewrite.mts'

const execFileAsync = promisify(execFile)

/**
 * CLI entry: `pnpm run i18n-extract -- <dir> [<dir> ...]` (or `node static-code-analysis/i18n-extract/extract.mts <dir> [<dir> ...]`)
 *
 * Extracts hardcoded UI strings (JSX text, `placeholder`/`title`/`aria-label`/`tooltip` attributes,
 * toast `onSuccess`/`onError` literals) under the given repo-relative directories, replacing each with a
 * `t()` call and writing the resulting keys into `ts-shared/ui-messages/messages/en.ts`'s isolated
 * `extracted` namespace. Prints a summary, including counts of ambiguous cases left untouched for
 * manual handling.
 *
 * This is a one-time migration codemod, not a repository-invariant check — it mutates source
 * files and the catalog rather than asserting a pass/fail state, so it is intentionally not wired
 * into `.github/workflows/static-code-analysis.yml`'s `run-node-checks` list. Its unit tests
 * (`*.test.mts` alongside each module here) still run in CI via the `i18n-extract-codemod`
 * vitest project.
 *
 * Output is deliberately unformatted (raw splice text, e.g. a long `onError(error, { fallback:
 * t('...'), tags: {...} })` stays on one line even past the print-width limit) — run `pnpm exec
 * oxfmt <dir> [<dir> ...]` over the same directories afterward. Reformatting alone never re-opens
 * an already-idempotent run: rerunning this CLI after `oxfmt` still reports zero rewrites.
 */
async function main(): Promise<void> {
  const dirs = process.argv.slice(2)
  if (dirs.length === 0) {
    console.error('Usage: node static-code-analysis/i18n-extract/extract.mts <dir> [<dir> ...]')
    process.exitCode = 1
    return
  }

  const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'])
  const repoRoot = stdout.trim()
  const enTsPath = join(repoRoot, 'ts-shared/ui-messages/messages/en.ts')

  const files = await listCandidateFiles(repoRoot, dirs)
  const allEntries: CatalogEntry[] = []
  const reports: RewriteReport[] = []
  const sourceTextByFile = new Map<string, string>()
  let changedCount = 0

  for (const relativePath of files) {
    const absolutePath = join(repoRoot, relativePath)
    const sourceText = await readFile(absolutePath, 'utf8')
    sourceTextByFile.set(relativePath, sourceText)
    const result = rewriteFile(relativePath, sourceText)
    reports.push(result.report)
    if (result.changed) {
      changedCount++
      await writeFile(absolutePath, result.newText, 'utf8')
    }
    allEntries.push(...result.entries)
  }

  if (allEntries.length > 0) {
    const enTsSourceText = await readFile(enTsPath, 'utf8')
    const merge = mergeExtractedEntries(enTsSourceText, allEntries)
    await writeFile(enTsPath, merge.mergedText, 'utf8')
    console.log(
      `Catalog: ${merge.addedCount} new key(s) added, ${merge.totalExtractedCount} total under "extracted".`,
    )
  }

  const skippedTargetCount = reports.reduce((sum, report) => sum + report.skippedTargets.length, 0)
  const skippedFunctionCount = reports.reduce(
    (sum, report) => sum + report.skippedFunctions.length,
    0,
  )
  console.log(`Scanned ${files.length} file(s), rewrote ${changedCount}.`)
  if (skippedTargetCount > 0) {
    console.log(`Skipped ${skippedTargetCount} ambiguous target(s) — manual bucket:`)
    for (const report of reports) {
      if (report.skippedTargets.length === 0) continue
      const sourceText = sourceTextByFile.get(report.filePath) ?? ''
      for (const skip of report.skippedTargets) {
        console.log(
          `  ${report.filePath}:${lineForOffset(sourceText, skip.start)} — ${skip.reason}`,
        )
      }
    }
  }
  if (skippedFunctionCount > 0) {
    console.log(`Skipped ${skippedFunctionCount} ineligible function(s) — manual bucket:`)
    for (const report of reports) {
      if (report.skippedFunctions.length === 0) continue
      for (const skip of report.skippedFunctions) {
        console.log(`  ${report.filePath}: ${skip.functionName} — ${skip.reason}`)
      }
    }
  }
}

/** 1-indexed line number of `offset` within `sourceText` — printed alongside each skip so the
 * manual bucket can be located in the file, since the CLI never keeps a `ts.SourceFile` around
 * past its originating `rewriteFile` call. */
function lineForOffset(sourceText: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset && i < sourceText.length; i++) {
    if (sourceText[i] === '\n') line++
  }
  return line
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
