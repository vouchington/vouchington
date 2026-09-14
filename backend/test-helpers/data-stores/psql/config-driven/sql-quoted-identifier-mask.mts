// Test-time judge for TypeScript-generated config-driven SQL
// (`generated-ddl-insert-invariants.mts`). Tracked `.sql` files use no-mistakes
// `postgres-idempotent-insert`.

// Postgres double-quoted identifiers (`"weird name"`, `""` escaping a literal `"`) can contain
// arbitrary text, including guard keywords like `DO UPDATE` or `NOT EXISTS` — unrelated to SQL
// structure. Both guards' masked-text keyword scans would otherwise mistake an identifier
// containing one for a real guard. Apply after the existing string/dollar-quote mask: its output
// is already all spaces, so no quote character it produced can be mistaken for an identifier
// delimiter here.
export function maskDoubleQuotedIdentifiers(masked: string): string {
  let out = ''
  let inQuote = false

  for (let i = 0; i < masked.length; i++) {
    const ch = masked[i]
    if (inQuote) {
      out += ch === '\n' ? '\n' : ' '
      if (ch === '"' && masked[i + 1] === '"') {
        out += ' '
        i++
      } else if (ch === '"') {
        inQuote = false
      }
      continue
    }
    if (ch === '"') {
      inQuote = true
      out += ' '
    } else {
      out += ch
    }
  }

  return out
}
