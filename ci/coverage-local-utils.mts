export function flagValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag)
  if (idx === -1) return undefined
  const next = argv[idx + 1]
  if (next === undefined || next.startsWith('--')) {
    throw new Error(`${flag} requires a value`)
  }
  return next
}

export function shellQuote(arg: string): string {
  if (/^[A-Za-z0-9_./:=@%-]+$/.test(arg)) return arg
  return `'${arg.replaceAll("'", String.raw`'\''`)}'`
}
