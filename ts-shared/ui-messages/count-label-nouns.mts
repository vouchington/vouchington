/**
 * Distinct noun pairs covered by `shared.countLabel.format`, gathered from every
 * `formatCountLabel(...)` call site across web and native clients (see git history for the sweep).
 * Add a new member here (and to every locale's lookup table below) when a new call site needs a
 * noun not already covered — the `CountLabelNouns` type keeps the four tables in lockstep.
 */
export type CountUnit =
  | 'action'
  | 'alias'
  | 'appeal'
  | 'candidate'
  | 'click'
  | 'conversation'
  | 'domain'
  | 'email'
  | 'field'
  | 'hostname'
  | 'image'
  | 'item'
  | 'key'
  | 'link'
  | 'member'
  | 'message'
  | 'moderator'
  | 'note'
  | 'participant'
  | 'page'
  | 'post'
  | 'positiveVote'
  | 'negativeVote'
  | 'prefix'
  | 'loadedReport'
  | 'queueItem'
  | 'listItem'
  | 'report'
  | 'reporter'
  | 'comment'
  | 'view'
  | 'rating'
  | 'review'
  | 'discussion'
  | 'result'
  | 'signup'
  | 'source'
  | 'topic'
  | 'url'
  | 'user'
  | 'visit'
  | 'visitor'

/** `[singular, plural]` label pair per `CountUnit`, one table per locale. */
export type CountLabelNouns = Record<CountUnit, readonly [singular: string, plural: string]>

export { COUNT_LABEL_NOUNS_EN } from './count-label-nouns/en.mts'
export { COUNT_LABEL_NOUNS_ES } from './count-label-nouns/es.mts'
export { COUNT_LABEL_NOUNS_FR } from './count-label-nouns/fr.mts'
export { COUNT_LABEL_NOUNS_PT } from './count-label-nouns/pt.mts'
