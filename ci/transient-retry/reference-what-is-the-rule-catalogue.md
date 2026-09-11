# What is the rule catalogue?

[Back to Transient-Retry Rule Catalogue](README.md#what-is-the-rule-catalogue)

`rules.mts` defines a typed list of `TransientRetryRule` entries. Each rule describes a specific CI failure fingerprint that is known to be transient (infrastructure noise, not a code bug).

Automatic `main` evaluation runs only while `HARNESS_DISPATCH_ENABLED` and
`HARNESS_FIX_MAIN_ENABLED` are both exactly `true`; both gates are unset by default. The
`triage-and-rerun` job evaluates these rules in order, and a matching rule within its `maxAttempts`
cap is retried instead of being sent to the Harness fix path.
