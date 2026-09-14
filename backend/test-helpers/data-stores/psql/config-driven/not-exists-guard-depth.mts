// Test-time judge for TypeScript-generated config-driven SQL
// (`generated-ddl-insert-invariants.mts`). Tracked `.sql` files use no-mistakes
// `postgres-idempotent-insert`.

// The regex fallback runs only once a fragment has already failed to parse as SQL (a PL/pgSQL DO
// body glued with a leading BEGIN/DECLARE, or an EXECUTE payload that still fails to parse
// standalone), so it cannot ask the AST whether NOT EXISTS belongs to the INSERT's own source
// predicate the way hasConjunctiveNotExists does. A conjunctive `WHERE`/`AND NOT EXISTS` match
// nested inside a parenthesized sub-expression — a scalar subquery used as a VALUES-list value,
// e.g. `VALUES ((SELECT 1 WHERE NOT EXISTS (...)))` — only guards that inner subquery; the outer
// INSERT still executes unconditionally either way. Requiring the match to sit at paren-depth
// zero rejects that case while still accepting a genuine top-level guard: any parenthesized
// construct preceding it (a column list, a function call) closes its own parens before the guard
// keyword is reached, so the running depth returns to zero there regardless of what came before.
export function hasTopLevelConjunctiveNotExists(maskedText: string): boolean {
  for (const match of maskedText.matchAll(/\b(?:WHERE|AND)\s+NOT\s+EXISTS\b/gi)) {
    if (match.index !== undefined && parenDepthAt(maskedText, match.index) === 0) return true
  }
  return false
}

function parenDepthAt(text: string, index: number): number {
  let depth = 0
  for (let i = 0; i < index; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')') depth--
  }
  return depth
}
