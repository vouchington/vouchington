export type CiLocalTargetName =
  | 'static'
  | 'backend-smoke'
  | 'web-api'
  | 'web-integration'
  | 'postgres-schema'

export interface CiLocalCommand {
  command: string
  description: string
  env?: Record<string, string | undefined>
  source?: {
    workflow: string
    contains: string | string[]
  }
}

export interface CiLocalTarget {
  description: string
  commands: CiLocalCommand[]
}
