import type { CopyrightCasePurgeJobData } from '../../queues/psql/types.mts'

export type Frame = NonNullable<CopyrightCasePurgeJobData['childFrames']>[number]
export type Edge = readonly [
  table: string,
  fkColumns: readonly string[],
  parentColumns: readonly string[],
  primaryKey: readonly string[],
  selectedColumns: readonly string[],
  cursorColumns: readonly string[],
]
export type Phase = readonly [table: string, path: readonly Edge[], predicate: string | null]

export function identifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error('Invalid copyright purge identifier')
  return `"${value}"`
}

export function equality(columns: readonly string[], offset: number) {
  return columns.map((column, index) => `child.${identifier(column)} = $${offset + index}`)
}

export function afterClause(columns: readonly string[], after: Frame['after'], offset: number) {
  if (!after) return { clause: '', values: [] as string[] }
  const values = columns.map(column => {
    const value = after[column]
    if (typeof value !== 'string' && typeof value !== 'number')
      throw new Error('Invalid copyright purge child cursor')
    return value
  })
  const lhs = columns.map(column => `child.${identifier(column)}`).join(', ')
  const rhs = columns.map((_, index) => `$${offset + index}`).join(', ')
  return { clause: ` AND (${lhs}) > (${rhs})`, values }
}

export function parentValues(edge: Edge, frame: Frame): Array<string | number> {
  return edge[2].map(column => {
    const value = frame.values[column]
    if (typeof value !== 'string' && typeof value !== 'number')
      throw new Error('Invalid copyright purge child path')
    return value
  })
}

export function childPredicate(phase: Phase): string {
  if (!phase[2]) return ''
  if (phase[2].startsWith('NOT EXISTS (')) return ` AND ${phase[2]}`
  return ` AND (child.${phase[2]})`
}

export function ascend(frames: Frame[], path: readonly Edge[]): boolean {
  if (frames.length === 1) return true
  const selected = frames.pop()!
  const parent = frames.at(-1)!
  const selectedEdge = path[frames.length - 1]!
  parent.after = Object.fromEntries(
    selectedEdge[5].map(column => [column, selected.values[column]!]),
  )
  return false
}
