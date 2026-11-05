export function gitSubcommandPattern(subcommand: string): RegExp {
  return new RegExp(
    String.raw`\bgit\b(?:\s+(?:-\S+(?:\s+\S+)?|--\S+(?:\s+\S+)?))*\s+` +
      subcommand +
      String.raw`\b`,
  )
}

export function shellLogicalLines(script: string): string[] {
  const lines: string[] = []
  let current = ''

  for (const rawLine of script.split('\n')) {
    const line = rawLine.trimEnd()
    const trailingBackslashes = line.match(/\\+$/)
    const continues = trailingBackslashes ? trailingBackslashes[0].length % 2 === 1 : false
    if (continues) {
      current += `${line.slice(0, -1)} `
      continue
    }
    lines.push(current + line)
    current = ''
  }

  if (current) lines.push(current)
  return lines
}

export function workflowHasTrigger(trigger: unknown, name: string): boolean {
  if (typeof trigger === 'string') return trigger === name
  if (Array.isArray(trigger)) return trigger.includes(name)
  return trigger !== null && typeof trigger === 'object' && Object.hasOwn(trigger, name)
}
