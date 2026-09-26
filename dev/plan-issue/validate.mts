import { validatePlanIssue } from './validate-body.mts'

export { buildPlanIssueCreateArgs } from './create-args.mts'
export const DIRECT_USER_REQUEST = 'direct user request; no prior github issue.'
export const REQUIRED_H2 = [
  'solves',
  'why',
  'kpis',
  'alternatives analysis',
  'affected files and modules',
  'before and after',
  'implementation plan',
  'affected tests',
  'new tests and scenarios',
  'documentation',
  'verification steps',
  'live browser preflight',
  'planning review',
] as const
export const LIVE_BROWSER_STATUSES = new Set(['not-required', 'available', 'exception'])

export function headingDisplay(heading: string): string {
  return heading === 'kpis' ? 'KPIs' : heading.replace(/^./, char => char.toUpperCase())
}

export { validatePlanIssue }
