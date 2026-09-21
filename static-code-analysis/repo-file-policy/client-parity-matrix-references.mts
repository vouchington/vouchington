import {
  matrixContent,
  matrixSourceAtLine,
  type ClientParityMatrixInput,
  type MatrixSourceLocation,
} from './client-parity-matrix-source.mts'

const ISSUE_LINK_DEFINITION_RE = /^\s*\[#(\d+)\]:\s+(\S+)(?:\s+.+)?$/
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
    })
  return definitions
}

export function parseReferencedIssueLocations(
  input: ClientParityMatrixInput,
): Map<string, MatrixSourceLocation> {
  const locations = new Map<string, MatrixSourceLocation>()
  matrixContent(input)
    .split('\n')
    .forEach((line, index) => {
      if (ISSUE_LINK_DEFINITION_RE.test(line)) return
      for (const match of line.matchAll(ISSUE_REF_RE)) {
        if (match[1] && !locations.has(match[1]))
          locations.set(match[1], matrixSourceAtLine(input, index + 1))
      }
    })
  return locations
}
