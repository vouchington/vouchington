export function trustedIssueAuthor(association: unknown): boolean {
  return association === 'OWNER' || association === 'MEMBER' || association === 'COLLABORATOR'
}
