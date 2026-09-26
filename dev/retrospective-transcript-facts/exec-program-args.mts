import { readQuotedString, skipValue } from './exec-program-scan.mts'
import { asRecord } from './compute-shared.mts'

// Extracts the `cmd`/`command` string field from a Codex `tools.exec_command({...})`
// argument object. Real rollouts carry two shapes side by side (see #8149): valid JSON
// (`{"cmd":"..."}`) and the unquoted-key JavaScript object-literal syntax some Codex
// client versions emit instead (`{cmd:"...",workdir:"...",yield_time_ms:10000}`).
// `JSON.parse` is tried first — correct and fastest for JSON-shaped payloads — and the
// loose scan below is only the fallback for the non-JSON shape, not the primary path.

type ScanState = { source: string; index: number }

function skipWhitespaceAndCommas(state: ScanState): void {
  while (state.index < state.source.length && /[\s,]/.test(state.source[state.index] ?? '')) {
    state.index++
  }
}

function readBareKey(state: ScanState): string | undefined {
  const start = state.index
  while (
    state.index < state.source.length &&
    /[A-Za-z0-9_$]/.test(state.source[state.index] ?? '')
  ) {
    state.index++
  }
  return state.index > start ? state.source.slice(start, state.index) : undefined
}

// Skips one value (string, number/boolean/null literal, or a nested object/array)
// starting at state.index, leaving state.index just past it. Nested containers track
// quote-aware brace/bracket depth so a brace or bracket inside a string value (an `rg`
// pattern argument, say) can't mis-balance the scan.
function extractCommandArgLoose(source: string): string | undefined {
  if (source[0] !== '{') return undefined
  const state: ScanState = { source, index: 1 }
  while (state.index < source.length) {
    skipWhitespaceAndCommas(state)
    if (state.index >= source.length || source[state.index] === '}') break
    const key =
      source[state.index] === '"' || source[state.index] === "'" || source[state.index] === '`'
        ? readQuotedString(state)
        : readBareKey(state)
    if (key === undefined) break
    skipWhitespaceAndCommas(state)
    if (source[state.index] !== ':') break
    state.index++
    skipWhitespaceAndCommas(state)
    if (key === 'cmd' || key === 'command') {
      const value = readQuotedString(state)
      if (typeof value === 'string') return value
      skipValue(state)
    } else {
      skipValue(state)
    }
  }
  return undefined
}

export function extractCommandArg(source: string): string | undefined {
  try {
    const record = asRecord(JSON.parse(source))
    if (record) {
      const command = record.cmd ?? record.command
      return typeof command === 'string' ? command : undefined
    }
    return undefined
  } catch {
    return extractCommandArgLoose(source)
  }
}
