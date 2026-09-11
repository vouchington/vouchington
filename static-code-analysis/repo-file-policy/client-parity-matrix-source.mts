import type { CanonicalMarkdownComposition } from './canonical-markdown-children.mts'

export type ClientParityMatrixInput = string | CanonicalMarkdownComposition

export interface MatrixSourceLocation {
  file?: string
  line: number
}

export function matrixContent(input: ClientParityMatrixInput): string {
  return typeof input === 'string' ? input : input.content
}

export function matrixSourceAtLine(
  input: ClientParityMatrixInput,
  line: number,
): MatrixSourceLocation {
  return typeof input === 'string' ? { line } : input.sourceAtLine(line)
}
