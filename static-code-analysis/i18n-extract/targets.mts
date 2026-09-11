import { decodeHtmlEntities } from '@ts-shared/utils/html'
import ts from 'typescript'
import { unwrapExpression, walkAst } from './ast.mts'

export type ExtractionTargetKind =
  | 'jsx-text'
  | 'jsx-attr'
  | 'toast-success'
  | 'toast-error-fallback'

export interface ExtractionTarget {
  kind: ExtractionTargetKind
  start: number
  end: number
  rawText: string
}

export interface SkipNote {
  reason: string
  start: number
}

export interface TargetScan {
  targets: ExtractionTarget[]
  skipped: SkipNote[]
}

const ATTRIBUTE_NAMES = new Set(['placeholder', 'title', 'aria-label', 'tooltip'])

/**
 * Walks `body` (a candidate function's block body) for extraction targets. Descends into nested
 * arrow/function expressions too (`.map(x => <li>{x}</li>)`, inline event handlers) — those close
 * over the outer function's scope in plain JS, so an injected `const t = ...` at the top of `body`
 * is reachable from anywhere inside this subtree. The only true scope boundary is a *separate*
 * top-level function elsewhere in the file, which is naturally excluded since callers scan each
 * candidate's own `body` independently.
 */
export function scanForTargets(body: ts.Block, sourceFile: ts.SourceFile): TargetScan {
  const targets: ExtractionTarget[] = []
  const skipped: SkipNote[] = []

  walkAst(body, node => {
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      scanJsxChildren(node, sourceFile, targets, skipped)
    } else if (ts.isJsxAttribute(node)) {
      scanJsxAttribute(node, targets, skipped)
    } else if (ts.isCallExpression(node)) {
      scanToastCall(node, targets, skipped)
    }
  })

  return { targets, skipped }
}

/** Extracts a JSX element's text child only when it is the sole meaningful (non-whitespace-only)
 * child — skips (and reports) any element whose children mix text with expressions/elements, since
 * v1 has no interpolation support. */
function scanJsxChildren(
  node: ts.JsxElement | ts.JsxFragment,
  sourceFile: ts.SourceFile,
  targets: ExtractionTarget[],
  skipped: SkipNote[],
): void {
  const meaningful = node.children.filter(
    child => !(ts.isJsxText(child) && child.text.trim() === ''),
  )
  if (meaningful.length === 0) return

  if (meaningful.length > 1) {
    const textChild = meaningful.find(ts.isJsxText)
    if (textChild) {
      skipped.push({
        reason: 'mixed JSX text + expression children',
        start: textChild.getStart(sourceFile),
      })
    }
    return
  }

  const [only] = meaningful
  if (!only || !ts.isJsxText(only)) return
  const inner = jsxTextInnerRange(only, sourceFile)
  if (inner)
    targets.push({ kind: 'jsx-text', start: inner.start, end: inner.end, rawText: inner.raw })
}

/** A JsxText node's raw text includes exact leading/trailing whitespace (indentation, newlines).
 * Returns the range of just the trimmed inner content, so replacement preserves formatting.
 *
 * `node.getStart(sourceFile)` already skips leading trivia (whitespace) for JsxText nodes, landing
 * on the first non-whitespace character — so the leading edge needs no further adjustment. Only
 * `getEnd()` (the raw node's hard end, trivia not skipped) needs trimming back past trailing
 * whitespace. Adding `raw`'s own leading-whitespace length on top of `getStart()` would double-skip
 * past the already-trimmed start, clipping into the real text (this was a real bug: it spliced
 * `{t(...)}` in the middle of/after the text instead of replacing it). Also not entity-decoded
 * (`a &amp; b` yields literal `&amp;`) — decode here or `{t(key)}` renders it unescaped. */
function jsxTextInnerRange(
  node: ts.JsxText,
  sourceFile: ts.SourceFile,
): { start: number; end: number; raw: string } | undefined {
  const raw = node.text
  if (raw.trim() === '') return undefined
  const start = node.getStart(sourceFile)
  const trailingWhitespace = raw.length - raw.trimEnd().length
  const end = node.getEnd() - trailingWhitespace
  return { start, end, raw: decodeHtmlEntities(raw.trim()) }
}

/** Only `placeholder`/`title`/`aria-label`/`tooltip` (`tooltip` is `TooltipButton`'s custom prop,
 * same shape) with a plain string-literal value (bare `x='...'` or braced `x={'...'}`) — never a
 * `JsxExpression` holding a template literal with interpolation/ternary/identifier; skipped instead. */
function scanJsxAttribute(
  attr: ts.JsxAttribute,
  targets: ExtractionTarget[],
  skipped: SkipNote[],
): void {
  const name = attr.name.getText()
  if (!ATTRIBUTE_NAMES.has(name)) return
  const initializer = attr.initializer
  if (!initializer) return

  // Bare form scans like JsxText (undecoded entities); braced form below is a plain JS string.
  if (ts.isStringLiteral(initializer)) {
    targets.push({
      kind: 'jsx-attr',
      start: initializer.getStart(),
      end: initializer.getEnd(),
      rawText: decodeHtmlEntities(initializer.text),
    })
    return
  }

  if (ts.isJsxExpression(initializer)) {
    const expr = initializer.expression
    if (!expr) return
    const inner = unwrapExpression(expr)
    if (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) {
      targets.push({
        kind: 'jsx-attr',
        start: initializer.getStart(),
        end: initializer.getEnd(),
        rawText: inner.text,
      })
      return
    }
    skipped.push({ reason: `dynamic ${name} expression`, start: initializer.getStart() })
  }
}

/** `onSuccess('literal')` bare single string-literal argument, and `onError(err, { fallback:
 * 'literal', ... })`'s `fallback` property specifically — never sibling properties like `tags`,
 * never non-literal arguments/values (reported as skips instead). */
function scanToastCall(
  call: ts.CallExpression,
  targets: ExtractionTarget[],
  skipped: SkipNote[],
): void {
  const callee = call.expression
  if (!ts.isIdentifier(callee)) return
  const name = callee.text

  if (name === 'onSuccess') {
    const [firstArg] = call.arguments
    if (!firstArg) return
    if (ts.isStringLiteral(firstArg)) {
      targets.push({
        kind: 'toast-success',
        start: firstArg.getStart(),
        end: firstArg.getEnd(),
        rawText: firstArg.text,
      })
    } else if (call.arguments.length === 1) {
      skipped.push({ reason: 'onSuccess non-literal single argument', start: firstArg.getStart() })
    }
    return
  }

  if (name === 'onError') {
    const optionsArg = call.arguments[1]
    if (!optionsArg || !ts.isObjectLiteralExpression(optionsArg)) return
    for (const prop of optionsArg.properties) {
      if (!ts.isPropertyAssignment(prop)) continue
      const propName = ts.isIdentifier(prop.name) ? prop.name.text : undefined
      if (propName !== 'fallback') continue
      if (ts.isStringLiteral(prop.initializer)) {
        targets.push({
          kind: 'toast-error-fallback',
          start: prop.initializer.getStart(),
          end: prop.initializer.getEnd(),
          rawText: prop.initializer.text,
        })
      } else {
        skipped.push({
          reason: 'onError fallback non-literal value',
          start: prop.initializer.getStart(),
        })
      }
    }
  }
}
