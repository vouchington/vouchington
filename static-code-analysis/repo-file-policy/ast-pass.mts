import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { SharedContext } from 'vouchington-tooling/shared-context'
import { parseSource, type ParsedAst } from '../targeted-guardrails/ast-utils.mts'

export interface AstFileVisitor {
  /** Selects which tracked files this visitor runs against. */
  matches: (file: string) => boolean
  /** Runs against one parsed file; push findings into this visitor's own error bucket. */
  visit: (file: string, content: string, ast: ParsedAst, errors: string[]) => void
}

/**
 * Runs a set of per-file AST visitors over the union of files they each select, parsing every
 * matched file exactly once and discarding the AST before moving to the next file.
 *
 * This replaces caching every parsed AST for the whole run: `shared-context.mts` used to memoize
 * every AST in a `Map` that never evicted, retaining ~1.5 GB simultaneously across ~6,000 backend
 * files even though only one AST is ever in use at a time (see the `run-node-checks` worker OOM
 * investigation, CI job 31151347379). Current consumers — the Postgres-runtime guard — are
 * purely per-file with zero cross-file state, so a single streaming pass is equivalent to
 * caching every AST, without the retention.
 *
 * Errors are returned as one bucket per visitor, in the same order as `visitors`, so callers can
 * concatenate them in whatever order preserves existing, human-facing CI output.
 */
export function runAstFilePass(
  repoRoot: string,
  trackedFiles: readonly string[],
  visitors: readonly AstFileVisitor[],
  ctx?: SharedContext,
): string[][] {
  const buckets: string[][] = visitors.map(() => [])

  for (const file of trackedFiles) {
    const matchingIndexes: number[] = []
    for (const [index, visitor] of visitors.entries()) {
      if (visitor.matches(file)) matchingIndexes.push(index)
    }
    if (matchingIndexes.length === 0) continue

    const content = ctx?.readTrackedFile?.(file) ?? readFileSync(join(repoRoot, file), 'utf8')
    if (content === null) continue

    let ast: ParsedAst
    try {
      ast = parseSource(content).ast
    } catch {
      continue
    }

    for (const index of matchingIndexes) {
      visitors[index].visit(file, content, ast, buckets[index])
    }
  }

  return buckets
}
