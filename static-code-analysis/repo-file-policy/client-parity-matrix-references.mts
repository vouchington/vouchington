import {
  matrixContent,
  matrixSourceAtLine,
  type ClientParityMatrixInput,
  type MatrixSourceLocation,
} from './client-parity-matrix-source.mts'

const ISSUE_LINK_DEFINITION_RE = /^\s*\[#(\d+)\]:\s+(\S+)(?:\s+.+)?$/
const INLINE_ISSUE_LINK_RE =
  /\[#(\d+)\]\(\s*(?:<([^>\n]+)>|([^\s)\n]+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g
export const ISSUE_REF_RE = /\[#(\d+)\]/g

export interface IssueLinkDefinition extends MatrixSourceLocation {
  issueId: string
  url: string
}

export function parseIssueLinkDefinitions(input: ClientParityMatrixInput): IssueLinkDefinition[] {
  const definitions: IssueLinkDefinition[] = []
  matrixContent(input)
    .split('\n')
    .forEach((line, index) => {
      const match = ISSUE_LINK_DEFINITION_RE.exec(line)
      if (match?.[1] && match[2]) {
        definitions.push({
          issueId: match[1],
          ...matrixSourceAtLine(input, index + 1),
          url: match[2],
        })
      }
      for (const inlineMatch of line.matchAll(INLINE_ISSUE_LINK_RE)) {
        const url = inlineMatch[2] ?? inlineMatch[3]
        if (inlineMatch[1] && url) {
          definitions.push({
            issueId: inlineMatch[1],
            ...matrixSourceAtLine(input, index + 1),
            url,
          })
        }
      }
    })
  return definitions
}
