export const RATE_LIMIT_SOURCE_FILE = 'cloudflare-worker/src/types.mts'
export const RATE_LIMIT_DOC_FILE = 'cloudflare-worker/reference-rate-limiting.md'

const RATE_LIMIT_BINDING_RE = /^\s*(RATE_LIMITER_[A-Z0-9_]+)\??:/gm
// Exact backticked mentions anywhere in the reference are enough for this guard; table
// structure is left to Markdown formatting checks.
const RATE_LIMIT_DOC_BINDING_RE = /`(RATE_LIMITER_[A-Z0-9_]+)`/g

function findRateLimiterBindings(sourceCode: string): string[] {
  const cleanCode = sourceCode.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n\r]*/g, '')
  const matches = Array.from(cleanCode.matchAll(RATE_LIMIT_BINDING_RE), match => match[1])
  return Array.from(new Set(matches))
}

function findDocumentedRateLimiterBindings(docMarkdown: string): string[] {
  const matches = Array.from(docMarkdown.matchAll(RATE_LIMIT_DOC_BINDING_RE), match => match[1])
  return Array.from(new Set(matches))
}

function formatBindingList(bindings: string[]): string {
  return bindings.map(binding => `\`${binding}\``).join(', ')
}

export function checkRateLimitDocBindingsSync(input: {
  sourceCode: string
  docMarkdown: string
}): string[] {
  const bindings = findRateLimiterBindings(input.sourceCode)
  if (bindings.length === 0) {
    return [
      `::error file=${RATE_LIMIT_SOURCE_FILE}::${RATE_LIMIT_SOURCE_FILE}: no RATE_LIMITER_* Env bindings found; if intentional, remove this guard, otherwise the parser regressed`,
    ]
  }

  const documentedBindings = findDocumentedRateLimiterBindings(input.docMarkdown)
  const documentedBindingSet = new Set(documentedBindings)
  const sourceBindingSet = new Set(bindings)
  const missing = bindings.filter(binding => !documentedBindingSet.has(binding))
  const stale = documentedBindings.filter(binding => !sourceBindingSet.has(binding))
  const errors: string[] = []

  if (missing.length > 0) {
    errors.push(
      `::error file=${RATE_LIMIT_DOC_FILE}::${RATE_LIMIT_DOC_FILE}: rate-limit binding documentation is missing Env binding(s): ${formatBindingList(missing)}`,
    )
  }

  if (stale.length > 0) {
    errors.push(
      `::error file=${RATE_LIMIT_DOC_FILE}::${RATE_LIMIT_DOC_FILE}: rate-limit binding documentation contains stale Env binding(s): ${formatBindingList(stale)}`,
    )
  }

  return errors
}
