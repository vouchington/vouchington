/** React compiler and hook rules that production source must never suppress. */
export const recommendedNativeReactCompilerRules = [
  'react/error-boundaries',
  'react/globals',
  'react/immutability',
  'react/incompatible-library',
  'react/preserve-manual-memoization',
  'react/purity',
  'react/refs',
  'react/set-state-in-effect',
  'react/set-state-in-render',
  'react/static-components',
  'react/unsupported-syntax',
  'react/use-memo',
  'react/void-use-memo',
] as const

export const categoryInheritedOffNativeReactCompilerRules = [
  'react/capitalized-calls',
  'react/exhaustive-effect-dependencies',
  'react/hooks',
  'react/memo-dependencies',
  'react/no-deriving-state-in-effects',
] as const
