import { inspect } from 'node:util'

const MAX_DEPTH = 5
const MAX_NESTED_ERRORS = 20

/** Formats an error and its nested errors without relying on util.format's shallow Error output. */
export function formatErrorTree(error: unknown): string {
  const seen = new Set<object>()
  let nestedCount = 0
  let omittedCount = 0

  const render = (value: unknown, depth: number, label?: string): string[] => {
    if (isObject(value)) {
      if (seen.has(value)) return indentLines('[circular]', depth, label)
      seen.add(value)
    }

    const lines = indentLines(formatValue(value), depth, label)
    for (const child of getChildren(value)) {
      if (depth >= MAX_DEPTH || nestedCount >= MAX_NESTED_ERRORS) {
        omittedCount += countOmitted(child.value, seen)
      } else {
        nestedCount += 1
        lines.push(...render(child.value, depth + 1, child.label))
      }
    }
    return lines
  }

  const lines = render(error, 0)
  if (omittedCount > 0) lines.push(`… ${omittedCount} more nested errors omitted`)
  return lines.join('\n')
}

function formatValue(value: unknown): string {
  if (!(value instanceof Error)) return inspect(value, { depth: 2 })
  if (typeof value.stack === 'string' && value.stack.length > 0) return value.stack

  const name = value.name || 'Error'
  return `${name}: ${value.message}`
}

function getChildren(value: unknown): { label: string; value: unknown }[] {
  if (!isObject(value)) return []

  const children: { label: string; value: unknown }[] = []
  const properties = value as Record<string, unknown>
  const errors = properties.errors
  if (Array.isArray(errors)) {
    errors.forEach((nestedError, index) =>
      children.push({ label: `errors[${index}]:`, value: nestedError }),
    )
  }
  const cause = properties.cause
  if (cause !== undefined) children.push({ label: 'cause:', value: cause })
  return children
}

function countOmitted(value: unknown, seen: Set<object>): number {
  const pending = [value]
  let count = 0
  while (pending.length > 0) {
    const current = pending.pop()
    if (isObject(current)) {
      if (seen.has(current)) {
        count += 1
        continue
      }
      seen.add(current)
    }
    count += 1
    const children = getChildren(current)
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push(children[index].value)
    }
  }
  return count
}

function indentLines(value: string, depth: number, label?: string): string[] {
  const indentation = '  '.repeat(depth)
  return value
    .split(/\r?\n/)
    .map((line, index) => `${indentation}${index === 0 && label ? `${label} ` : ''}${line}`)
}

function isObject(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
}
