import type { ExpressionNode } from './on-conflict-column-refs.mts'

const VOLATILE_FUNCTION_NAMES = new Set([
  'gen_random_uuid',
  'random',
  'nextval',
  'uuidv7',
  'uuidv4',
  'uuid_generate_v1',
  'uuid_generate_v1mc',
  'uuid_generate_v4',
  'now',
  'timeofday',
  'clock_timestamp',
  'statement_timestamp',
  'transaction_timestamp',
])
const VOLATILE_VALUE_FUNCTION_NAMES = new Set([
  'current_date',
  'current_time',
  'current_timestamp',
  'localtime',
  'localtimestamp',
])
const VOLATILE_SPECIAL_DATETIME_LITERALS = new Set(['now', 'today', 'tomorrow', 'yesterday'])
const DATETIME_CAST_TYPE_NAMES = new Set(['date', 'time', 'timetz', 'timestamp', 'timestamptz'])

/** A value that can differ across replays, including PostgreSQL date/time shorthand. */
export function volatileValueForm(node: ExpressionNode): string | undefined {
  const root = node.root
  if (root.kind === 'functionCall') {
    const name = root.name.parts.at(-1)?.identity
    if (name !== undefined && VOLATILE_FUNCTION_NAMES.has(name)) return `${name}()`
    if (name !== undefined && VOLATILE_VALUE_FUNCTION_NAMES.has(name)) {
      return name.toUpperCase()
    }
  }
  if (root.kind === 'typedLiteral') {
    const type = root.dataType.toLowerCase().split('.').at(-1)
    const value = root.value.trim().toLowerCase()
    if (
      type !== undefined &&
      DATETIME_CAST_TYPE_NAMES.has(type) &&
      VOLATILE_SPECIAL_DATETIME_LITERALS.has(value)
    ) {
      return `${type} '${value}'`
    }
  }
  if (root.kind === 'cast') {
    const type = root.dataTypeFacts.builtin ?? root.dataTypeFacts.name?.parts.at(-1)?.identity
    const operand = node.children.find(child => child.role === 'castOperand')
    const value = operand?.root.kind === 'literal' ? operand.root.value : undefined
    if (
      type !== undefined &&
      DATETIME_CAST_TYPE_NAMES.has(type.toLowerCase()) &&
      value?.kind === 'string' &&
      VOLATILE_SPECIAL_DATETIME_LITERALS.has(value.value.trim().toLowerCase())
    ) {
      return `${type} '${value.value.trim().toLowerCase()}'`
    }
  }
  return undefined
}
