import {
  matrixContent,
  matrixSourceAtLine,
  type ClientParityMatrixInput,
  type MatrixSourceLocation,
} from './client-parity-matrix-source.mts'

const ISSUE_DEFINITION_RE =
  /^\s*\[#(\d+)\]:\s+(https?):\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)\s*$/i
export const ISSUE_REF_RE = /\[#(\d+)\]/g

export interface IssueDefinition extends MatrixSourceLocation {
  issueId: string
  protocol: string
  owner: string
  repository: string
  urlIssueId: string
}

export function parseIssueDefinitions(input: ClientParityMatrixInput): IssueDefinition[] {
  const definitions: IssueDefinition[] = []
  matrixContent(input)
    .split('\n')
    .forEach((line, index) => {
      const match = ISSUE_DEFINITION_RE.exec(line)
      if (match?.[1] && match[2] && match[3] && match[4] && match[5]) {
        definitions.push({
          issueId: match[1],
          ...matrixSourceAtLine(input, index + 1),
          protocol: match[2],
          owner: match[3],
          repository: match[4],
          urlIssueId: match[5],
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
      if (ISSUE_DEFINITION_RE.test(line)) return
      for (const match of line.matchAll(ISSUE_REF_RE)) {
        if (match[1] && !locations.has(match[1]))
          locations.set(match[1], matrixSourceAtLine(input, index + 1))
      }
    })
  return locations
}
