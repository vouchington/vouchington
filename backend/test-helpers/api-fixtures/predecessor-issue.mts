/**
 * The predecessor repository is now archived and private, so its issue URLs
 * are dead links for the public. Use this to record provenance as
 * `migratedFrom: [predecessorIssue(<n>)]`, retaining only the issue number.
 */
export function predecessorIssue(issue: number): string {
  return `predecessor-issue#${issue}`
}
