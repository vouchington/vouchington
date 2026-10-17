# Rule Consolidation Concepts

[Back to Transient-Retry Rule Catalogue](README.md#rule-consolidation-concepts)

The scoped [automatic invariants](../../../../ci/transient-retry/AGENTS.md) require one rule per consumer and
root cause, not per status code or URL. This section explains the concepts behind that rule.

### What "same root cause" means

A flake in the same external dependency is one root cause even if it surfaces as different HTTP
status codes, `curl` exit codes, step timeouts, or asset paths within the same release.

### How to broaden a fingerprint

Keep the consumer's terminal failure marker as the anchor, because it proves the failure happened
in the right job context, then OR together the transient-cause variants. For multi-error logs, require
that every error block matches a known transient predicate, so a genuine non-transient error mixed
into the set is never silently rerun.
