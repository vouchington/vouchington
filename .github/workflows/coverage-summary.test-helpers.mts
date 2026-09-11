// Shared by coverage-summary.test.mts; extracted to stay under the 300-line Vitest test-file cap.
//
// The upload-coverage-pair composite action's "Validate coverage suite" step is a single inline
// bash `case` statement -- there is no JS validation function to import and call in-process. Two
// prior attempts to fix this test's flakiness (#9188, #9061) left it re-executing that YAML text
// as a real bash subprocess per assertion (`execFileSync('bash', ['-c', validation.run], ...)`),
// which is what destabilized under CI memory pressure (#9344). This module instead pins the
// pattern's exact literal text -- a `toBe` tripwire: any bash-side edit fails the test loudly and
// forces a synchronized update here -- and provides a hand-derived, spawn-free regex equivalent to
// assert accept/reject behavior against, with zero subprocess calls.
export const SUITE_CASE_PATTERN = "''|-*|*-|*--*|*[![:lower:][:digit:]-]*|retry|*-retry"

// Arm-by-arm equivalent of SUITE_CASE_PATTERN:
//   ''                        -> non-empty
//   -*                        -> no leading hyphen
//   *-                        -> no trailing hyphen
//   *--*                      -> no double hyphen
//   *[![:lower:][:digit:]-]*  -> every character is lowercase, a digit, or a hyphen (negated
//                                POSIX [:lower:]/[:digit:] classes plus the literal hyphen)
//   retry|*-retry             -> must not be exactly "retry" or end in "-retry":
//                                normalize-retry-artifact-directories.mts
//                                (ci/normalize-retry-artifact-directories.mts) strips a trailing
//                                "-retry" off any downloaded directory name unconditionally. A
//                                suite legitimately named e.g. "integration-retry" would have its
//                                own primary upload's directory misclassified as a retry artifact
//                                of "integration" and silently renamed -- and a bare suite named
//                                "retry" hits the same collision, because the action's fixed
//                                artifact-name prefix ("coverage-"/"vitest-report-attempt-")
//                                already ends in a hyphen, so its own primary directory name
//                                (e.g. "coverage-retry") still ends in "-retry". Reserving both
//                                shapes here (and in upload-vitest-report-attempt's own "Validate
//                                suite" step) makes that ambiguity unrepresentable instead of
//                                merely documented.
//
// Equivalence requires the composite action to pin `LC_ALL: C` (not merely C.UTF-8, which still
// classifies multi-byte lowercase letters like the "e" in "café" as [:lower:] on at least one
// tested libc) -- without it, POSIX [:lower:]/[:digit:] admit non-ASCII "lowercase" bytes under
// common locales, so the guard would accept suites this regex rejects (#9061 already hit a
// locale-collation bug in this exact guard). Keep this regex, the bash character classes, and the
// action's `LC_ALL: C` env pin in sync on any future edit.
//
// Some producer workflows pass a matrix-templated suite (e.g. `backend-shard-${{ matrix.shard }}`)
// that only resolves to a literal value at runtime -- callers checking real `with.suite` values
// (not the fixed accept/reject cases above) should replace `${{ ... }}` segments with a placeholder
// before matching, since this regex can't validate a value it can't see.
export const VALID_SUITE = /^(?!(?:.*-)?retry$)[a-z0-9]+(?:-[a-z0-9]+)*$/
