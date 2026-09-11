export type PrecheckFrame = 'exists' | 'notExists' | null

export function readStartedIfBlocks(statement: string): PrecheckFrame[] {
  const ifBlocks: PrecheckFrame[] = []
  for (const match of statement.matchAll(/\b(?:ELS)?IF\b([\s\S]*?)\bTHEN\b/gis)) {
    const condition = match[1] ?? ''
    if (isCompleteExistsCondition(condition, true)) {
      ifBlocks.push('notExists')
    } else if (isCompleteExistsCondition(condition, false)) {
      ifBlocks.push('exists')
    } else {
      ifBlocks.push(null)
    }
  }
  return ifBlocks
}

function isCompleteExistsCondition(condition: string, isNegated: boolean): boolean {
  const prefix = isNegated ? /^\s*NOT\s+EXISTS\s*\(/is : /^\s*EXISTS\s*\(/is
  const match = prefix.exec(condition)
  if (!match) return false

  let depth = 1
  for (let i = match[0].length; i < condition.length; i++) {
    if (condition[i] === '(') {
      depth++
    } else if (condition[i] === ')') {
      depth--
      if (depth === 0) return condition.slice(i + 1).trim() === ''
    }
  }
  return false
}
