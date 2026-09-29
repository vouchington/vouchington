/**
 * Distinct noun pairs covered by `shared.countLabel.format`, gathered from every
 * `formatCountLabel(...)` call site across web and native clients (see git history for the sweep).
 * Add a new member here (and to every locale's lookup table below) when a new call site needs a
 * noun not already covered — the `CountLabelNouns` type keeps the four tables in lockstep.
 */
export type { CountUnit, CountLabelNouns } from './count-label-nouns/types.mts'

export { COUNT_LABEL_NOUNS_EN } from './count-label-nouns/en.mts'
export { COUNT_LABEL_NOUNS_ES } from './count-label-nouns/es.mts'
export { COUNT_LABEL_NOUNS_FR } from './count-label-nouns/fr.mts'
export { COUNT_LABEL_NOUNS_PT } from './count-label-nouns/pt.mts'
