// Closed GitHub-hosted runner label set. Every `runs-on:` in this repo must resolve to
// exactly one of these four labels (or delegate to a reusable workflow that owns its own
// runner choice). Widening this set is a policy change, not a routine workflow edit.
export const ALLOWED_LABELS = [
  'ubuntu-slim',
  'ubuntu-latest',
  'ubuntu-24.04-arm',
  'macos-latest',
] as const
export type AllowedLabel = (typeof ALLOWED_LABELS)[number]

export function isAllowedLabel(value: unknown): value is AllowedLabel {
  return typeof value === 'string' && (ALLOWED_LABELS as readonly string[]).includes(value)
}

export type ClassifyResult = {
  kind: 'literal' | 'matrix' | 'delegate' | 'invalid'
  allowed: boolean
  resolvedLabels?: string[]
}

const MATRIX_EXPRESSION = /^\$\{\{\s*matrix\.([a-zA-Z0-9_]+)\s*\}\}$/

/**
 * Pure classifier for a job's `runs-on:` value against the closed allowlist above.
 * `matrix` is the job's own `strategy.matrix` block (when present), used to resolve a
 * `${{ matrix.<field> }}` runs-on expression to its concrete candidate labels.
 */
export function classifyRunsOnValue(
  runsOn: unknown,
  matrix?: Record<string, unknown> | undefined,
): ClassifyResult {
  if (runsOn === undefined) {
    return { kind: 'delegate', allowed: true }
  }

  if (typeof runsOn === 'string') {
    const matrixMatch = MATRIX_EXPRESSION.exec(runsOn)
    if (matrixMatch) {
      const field = matrixMatch[1] as string
      const candidates = matrix?.[field]
      if (!Array.isArray(candidates) || candidates.length === 0) {
        return { kind: 'matrix', allowed: false }
      }
      const allAllowed = candidates.every(candidate => isAllowedLabel(candidate))
      return {
        kind: 'matrix',
        allowed: allAllowed,
        resolvedLabels: candidates.filter((c): c is string => typeof c === 'string'),
      }
    }

    if (runsOn.includes('${{')) {
      // Any other computed expression cannot be statically verified against the allowlist.
      return { kind: 'invalid', allowed: false }
    }

    return { kind: 'literal', allowed: isAllowedLabel(runsOn), resolvedLabels: [runsOn] }
  }

  // Arrays (old self-hosted-style label sets) and object forms ({group, labels}) are not
  // part of the closed set: every allowed label is used as a single bare string.
  return { kind: 'invalid', allowed: false }
}
