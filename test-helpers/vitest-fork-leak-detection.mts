import {
  createForkLeakDetector,
  type ForkLeakDetector,
  type ForkLeakDetectorOptions,
} from 'vouchington-tooling/vitest-diagnostics'

const FORK_LEAK_DETECTOR_KEY = Symbol.for('vitest-fork-leak-detector')

type GlobalWithForkLeakDetector = typeof globalThis & {
  [FORK_LEAK_DETECTOR_KEY]?: ForkLeakDetector
}

// Vitest re-evaluates a fork's setupFiles on every file while reusing the OS process.
// A module-scope detector would reset every file and never leave the warmup window.
export function getForkLeakDetector(options: ForkLeakDetectorOptions = {}): ForkLeakDetector {
  const target = globalThis as GlobalWithForkLeakDetector
  return (target[FORK_LEAK_DETECTOR_KEY] ??= createForkLeakDetector(options))
}
