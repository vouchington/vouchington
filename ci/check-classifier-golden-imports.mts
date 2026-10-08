import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  dependencies,
  resolveCheck,
  type ImportClosureResult,
  type ResolveCheckBatchResult,
} from 'no-mistakes'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const tsconfig = 'backend/tsconfig.json'
const configurationTables =
  '(?:classifier_candidate_thresholds|classifier_prompt_versions|classifiers)'
const configurationWrite = new RegExp(
  `\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+${configurationTables}\\b`,
  'iu',
)
const firstPartyWorkspaceImport = /^@(?:agents|services)\//u

export const classifierGoldenEntrypoints = [
  'backend/agents/post-classifier/post-classifier.golden.openrouter.test.mts',
  'backend/agents/autotagger/autotagger.golden.openrouter.test.mts',
]

/** Files whose absence would mean the traversal no longer reaches the classifier call path. */
export const requiredClassifierGoldenFiles = [
  'backend/agents/classifiers/prepare-single-call.mts',
  'backend/agents/post-classifier/classifier-input.mts',
  'backend/agents/autotagger/classifier-run-bindings.mts',
  'backend/agents/autotagger/content.mts',
  'email-templates/index.mts',
  'email-templates/types.mts',
]

export type ClassifierGoldenAuditInput = {
  entrypoints: readonly string[]
  requiredFiles: readonly string[]
  readClosure: (entrypoints: string[]) => Promise<ImportClosureResult>
  readImports: (files: [string, ...string[]]) => Promise<ResolveCheckBatchResult>
  readSource: (file: string) => string
}

/**
 * Lists why the classifier golden set's import graph is incomplete or could write classifier
 * thresholds, prompt versions, or configuration.
 */
export async function classifierGoldenImportErrors({
  entrypoints,
  requiredFiles,
  readClosure,
  readImports,
  readSource,
}: ClassifierGoldenAuditInput): Promise<string[]> {
  const closure = await readClosure([...entrypoints])
  if (closure.diagnostics.length > 0) {
    return closure.diagnostics.map(
      item => `${item.config ?? tsconfig}: ${item.kind} ${item.detail}`,
    )
  }
  // The closure lists dependencies only, so the entrypoints are added back.
  const [firstFile, ...otherFiles] = [...new Set([...entrypoints, ...closure.files])].toSorted()
  if (firstFile === undefined) return ['the classifier golden set has no entrypoints']
  const graph = new Set([firstFile, ...otherFiles])
  const errors: string[] = []
  for (const result of (await readImports([firstFile, ...otherFiles])).results) {
    for (const item of result.imports) {
      if (item.kind === 'require' || item.kind === 'require-resolve') continue
      const label = `${result.file}: ${item.specifier}`
      if (
        item.status === 'unresolved' ||
        (item.status === 'external' && firstPartyWorkspaceImport.test(item.specifier))
      ) {
        errors.push(`${label} does not resolve`)
      } else if (item.status === 'resolved' && !graph.has(item.resolved ?? '')) {
        errors.push(`${label} resolves outside the traversed graph to ${item.resolved}`)
      }
    }
  }
  for (const file of graph) {
    if (configurationWrite.test(readSource(file))) {
      errors.push(`${file} writes classifier configuration`)
    }
  }
  for (const file of requiredFiles) {
    if (!graph.has(file)) errors.push(`${file} is missing from the traversed graph`)
  }
  return errors
}

/* v8 ignore start -- the no-mistakes CI job runs this live repository audit; fixture tests cover the core. */
if (import.meta.main) {
  // Deadline-free so a concurrent `no-mistakes check` queues these calls instead of failing them.
  const invocation = { root: repoRoot, tsconfig, timeout: 0, lockTimeout: 0 }
  const errors = await classifierGoldenImportErrors({
    entrypoints: classifierGoldenEntrypoints,
    requiredFiles: requiredClassifierGoldenFiles,
    readClosure: files =>
      dependencies({
        ...invocation,
        files,
        projection: 'paths',
        // CommonJS require() is outside the golden-set graph.
        relationships: ['import-static', 'import-dynamic', 'import-type', 'workspace'],
      }),
    readImports: files => resolveCheck({ ...invocation, files }),
    readSource: file => readFileSync(resolve(repoRoot, file), 'utf8'),
  })
  for (const error of errors) console.error(error)
  if (errors.length > 0) process.exitCode = 1
  else console.log('The classifier golden set cannot write classifier configuration.')
}
/* v8 ignore stop */
