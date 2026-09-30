import type {
  ClassifierDecisionBand,
  ClassifierGoldenExpectation,
} from './classifier-golden-set.mts'

const negativeBands: readonly ClassifierDecisionBand[] = ['below-lower', 'between']
const positiveBands: readonly ClassifierDecisionBand[] = ['at-or-above-upper', 'between']

export function expectations(
  candidateKeys: readonly string[],
  positiveKeys: readonly string[],
  negativeRationale: string,
  positiveRationale: string,
): Readonly<Record<string, ClassifierGoldenExpectation>> {
  return Object.fromEntries(
    candidateKeys.map(key => [
      key,
      {
        acceptableBands: positiveKeys.includes(key) ? positiveBands : negativeBands,
        rationale: positiveKeys.includes(key) ? positiveRationale : negativeRationale,
      },
    ]),
  )
}

export const postClassifierKeys = [
  'self-promotion',
  'buying',
  'selling',
  'trade',
  'for-hire',
  'hiring',
  'political',
  'click-bait',
  'vague-post',
  'shit-post',
] as const

export const autotaggerCandidateSlate = [
  'Airline loyalty programs',
  'Airport lounges',
  'Home cooking',
  'Road trips',
] as const
