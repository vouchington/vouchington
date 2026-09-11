import ts from 'typescript'
import {
  type CandidateFunction,
  findCandidateFunctions,
  findExistingTranslatorBinding,
  hasUseClientDirective,
  unwrapExpression,
} from './ast.mts'
import { scanForTargets } from './targets.mts'

export type TranslatorMode = 'client' | 'server'
type ExistingKind = 'useTranslations' | 'getTranslations' | 'other'

export interface FunctionBinding {
  candidate: CandidateFunction
  mode: TranslatorMode
  /** Present when `body` already has a usable `const t = ...` — reuse it, don't inject another. */
  existing: ts.VariableStatement | undefined
}

export interface BindingSkip {
  functionName: string
  reason: string
}

export interface BindingScan {
  eligible: FunctionBinding[]
  skipped: BindingSkip[]
}

/**
 * Per-function eligibility, not per-file: a file may export more than one component/hook, and
 * each is judged independently so one ineligible function never blocks another in the same file.
 *
 * - Client mode requires a top-level `'use client'` directive; any block-bodied component/hook
 *   function in such a file may call `useTranslations()` (hooks may call other hooks).
 * - Server mode requires the function to *already* be `async` — the codemod never adds `async`
 *   itself, since that could change a caller's expectations of the function's return type.
 * - A function whose body already binds a local `t` from the matching translator API is reused
 *   as-is. A `t` bound to anything else (an unrelated local, or the wrong-mode translator call) is
 *   a name collision — that function is skipped entirely rather than risk shadowing/breaking it.
 * - A candidate with zero extraction targets (and zero ambiguous near-misses) has nothing to
 *   translate, so it is dropped silently rather than reported — most components (pure structural
 *   wrappers like `Button`/`Card`/`Table`) never contain a translatable string at all, and flagging
 *   them as "manual bucket" would swamp the real ineligible-function list with noise.
 */
export function scanFunctionBindings(sourceFile: ts.SourceFile): BindingScan {
  const isClientFile = hasUseClientDirective(sourceFile)
  const eligible: FunctionBinding[] = []
  const skipped: BindingSkip[] = []

  for (const candidate of findCandidateFunctions(sourceFile)) {
    const targetScan = scanForTargets(candidate.body, sourceFile)
    if (targetScan.targets.length === 0 && targetScan.skipped.length === 0) continue

    const mode: TranslatorMode = isClientFile ? 'client' : 'server'
    const existingStatement = findExistingTranslatorBinding(candidate.body)

    if (!isClientFile && !candidate.isAsync) {
      skipped.push({
        functionName: candidate.name,
        reason: 'not a client file and function is not already async — skipped (manual bucket)',
      })
      continue
    }

    if (existingStatement) {
      const kind = classifyExistingBinding(existingStatement)
      const wantsKind: ExistingKind = mode === 'client' ? 'useTranslations' : 'getTranslations'
      if (kind !== wantsKind) {
        skipped.push({
          functionName: candidate.name,
          reason: `local "t" already bound to something other than ${wantsKind} — skipped to avoid shadowing`,
        })
        continue
      }
      eligible.push({ candidate, mode, existing: existingStatement })
      continue
    }

    eligible.push({ candidate, mode, existing: undefined })
  }

  return { eligible, skipped }
}

/** Classifies an existing `const t = ...` statement's initializer shape. */
function classifyExistingBinding(statement: ts.VariableStatement): ExistingKind {
  for (const decl of statement.declarationList.declarations) {
    if (!ts.isIdentifier(decl.name) || decl.name.text !== 't' || !decl.initializer) continue
    const init = unwrapExpression(decl.initializer)
    const call = ts.isAwaitExpression(init) ? unwrapExpression(init.expression) : init
    if (ts.isCallExpression(call) && ts.isIdentifier(call.expression)) {
      if (call.expression.text === 'useTranslations') return 'useTranslations'
      if (call.expression.text === 'getTranslations') return 'getTranslations'
    }
  }
  return 'other'
}
