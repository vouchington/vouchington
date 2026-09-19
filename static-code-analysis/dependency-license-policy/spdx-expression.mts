import parseSpdx from 'spdx-expression-parse'

/**
 * SPDX license-expression adapter and policy evaluator.
 *
 * `spdx-expression-parse` owns the grammar plus the maintained SPDX license
 * and exception registries. This adapter keeps the small tree shape the
 * policy evaluator needs and rejects custom `LicenseRef` / `DocumentRef`
 * atoms: those references are valid SPDX syntax, but they do not identify a
 * reviewed standard license and therefore must fail closed at this policy
 * boundary.
 *
 * `OR` means the consumer may pick either branch (the expression is clean if
 * any branch is clean); `AND` means both licenses apply simultaneously (the
 * expression is only clean if every branch is clean). A trailing `+` and a
 * `WITH <exception>` clause stay on the atom string for diagnostics and
 * conservative allowlist matching.
 */

export type SpdxNode =
  | { type: 'AND'; children: SpdxNode[] }
  | { type: 'OR'; children: SpdxNode[] }
  | { type: 'ATOM'; id: string }

type ParsedSpdxNode = ReturnType<typeof parseSpdx>

function isCustomLicenseReference(licenseId: string): boolean {
  return licenseId.startsWith('LicenseRef-') || licenseId.startsWith('DocumentRef-')
}

function convertParsedNode(parsed: ParsedSpdxNode): SpdxNode {
  if ('license' in parsed) {
    if (isCustomLicenseReference(parsed.license)) {
      throw new Error(`Custom SPDX license references are not allowed: ${parsed.license}`)
    }
    const id = `${parsed.license}${parsed.plus ? '+' : ''}${
      parsed.exception ? ` WITH ${parsed.exception}` : ''
    }`
    return { type: 'ATOM', id }
  }

  const type = parsed.conjunction === 'and' ? 'AND' : 'OR'
  const children = [convertParsedNode(parsed.left), convertParsedNode(parsed.right)].flatMap(
    child => (child.type === type ? child.children : [child]),
  )
  return { type, children }
}

/**
 * Parses a standard SPDX license expression into a tree. Throws on malformed
 * input, unknown license or exception identifiers, and custom SPDX license
 * references. Callers must catch and fail closed rather than crashing the
 * check or treating an unrecognized atom as permissive.
 */
export function parseSpdxExpression(expression: string): SpdxNode {
  if (expression.trim().length === 0) {
    throw new Error('Invalid SPDX license expression: expression is empty')
  }
  try {
    return convertParsedNode(parseSpdx(expression))
  } catch (error) {
    throw new Error(
      `Invalid SPDX license expression: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
}

/**
 * Evaluates whether a parsed expression is "clean" under `isAtomOk`: an OR
 * node is clean if any child is clean (the consumer can choose the clean
 * license); an AND node is clean only if every child is clean (every listed
 * license applies at once, so one bad license taints the whole grouping).
 */
export function evaluateSpdxExpression(
  node: SpdxNode,
  isAtomOk: (atomId: string) => boolean,
): boolean {
  if (node.type === 'ATOM') return isAtomOk(node.id)
  if (node.type === 'OR')
    return node.children.some(child => evaluateSpdxExpression(child, isAtomOk))
  return node.children.every(child => evaluateSpdxExpression(child, isAtomOk))
}

/** Flattens every atom id out of a parsed expression tree, for diagnostics. */
export function collectSpdxAtoms(node: SpdxNode): string[] {
  if (node.type === 'ATOM') return [node.id]
  return node.children.flatMap(collectSpdxAtoms)
}
