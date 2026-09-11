type FlagValue = string | boolean | undefined

export type ParsedFlagArgs<Parsed extends Record<string, FlagValue>> = {
  parsed: Parsed
  positional: string[]
}

type StringKey<Parsed extends Record<string, FlagValue>> = Extract<keyof Parsed, string>

export type FlagKey<Parsed extends Record<string, FlagValue>> =
  | StringKey<Parsed>
  | { key: StringKey<Parsed>; type: 'boolean' }

// Shared by every blackboard/retrospective CLI subcommand (append, entries, save,
// list, read, archive): each one only differs in its flag map, its ParsedArgs
// shape, and its positional-argument error message, so those stay call-site-local
// while this owns the actual argv walk.
export function parseFlagArgs<Parsed extends Record<string, FlagValue>>(
  argv: string[],
  flagKeys: Record<string, FlagKey<Parsed>>,
): ParsedFlagArgs<Parsed> {
  const parsed: Record<string, FlagValue> = {}
  const positional: string[] = []
  let optionsEnded = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!optionsEnded && arg === '--') {
      optionsEnded = true
      continue
    }
    const flag: FlagKey<Parsed> | undefined = optionsEnded ? undefined : flagKeys[arg]
    if (flag) {
      const key = String(typeof flag === 'string' ? flag : flag.key)
      if (typeof flag !== 'string' && flag.type === 'boolean') {
        if (parsed[key] !== undefined) throw new Error(`${arg} may only be specified once`)
        parsed[key] = true
        continue
      }
      const value = argv[i + 1]
      // A missing value looks like `undefined`, the end-of-options marker, or
      // another recognized flag — not just "starts with a dash", since a
      // legitimate value (e.g. a file path) may itself start with one.
      const valueMissing = value === undefined || value === '--' || Object.hasOwn(flagKeys, value)
      if (valueMissing) throw new Error(`${arg} requires a value`)
      if (parsed[key] !== undefined) throw new Error(`${arg} may only be specified once`)
      parsed[key] = value
      i++
    } else if (!optionsEnded && arg.startsWith('-')) {
      throw new Error(`unknown option: ${arg}`)
    } else {
      positional.push(arg)
    }
  }
  return { parsed: parsed as Parsed, positional }
}
