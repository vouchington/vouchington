export type CheckName =
  | 'config-inventory-policy'
  | 'dependency-license-policy'
  | 'repo-file-policy'
  | 'scc-complexity'
  | 'targeted-guardrails'

export interface CheckResult {
  name: CheckName
  errors: string[]
  fixes?: string[]
}
