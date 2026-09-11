# Shared Vocabulary: AWS Transport Transients

[Back to Transient-Retry Rule Catalogue](README.md#shared-vocabulary-aws-transport-transients)

Several unrelated consumers reach AWS control planes over the network — ECR Docker
login/push, Lambda `update-function-code`, and future S3/other AWS CLI or SDK calls — and
fail with the same family of transport-level errors: TLS handshake timeout, timeout
awaiting response headers, connection reset, context deadline exceeded, connection closed before a
response, unexpected EOF, or a raw I/O timeout. `aws-transport-fingerprints.mts` exports
`hasAwsTransportTransientError(text)`, which ORs these marker strings so rule authors reuse
one vocabulary instead of re-typing it per incident. It also exports the Go `net/http`
transport subset consumed by `gh-api.mts` for its own `gh api` calls.
`aws-transport-fingerprints.mts` is the canonical vocabulary: new transport-error variants go
there first, and `gh-api.mts` imports the shared Go transport subset instead of copying it.

This generalizes the **marker vocabulary**, not the **scope**. Every consumer must still
anchor to its own terminal failure marker and sole-failed-job guard first, then call the
shared predicate on that anchored slice — do not let it become a blind cross-job matcher:

```ts
import { hasAwsTransportTransientError } from './aws-transport-fingerprints.mts'

function hasMyDeployAwsTransportFailure(log: string): boolean {
  const index = log.lastIndexOf('##[error]my-deploy-step failed:')
  if (index === -1) return false
  const terminal = log.slice(index)
  return (
    terminal.includes('reached-my-aws-endpoint-marker') && hasAwsTransportTransientError(terminal)
  )
}
```

A new transport-cause variant (not TLS handshake timeout / response-header timeout /
connection reset / context deadline exceeded / connection closed / unexpected EOF / I/O timeout) is
a genuinely new member of this root-cause class — add it as a marker inside
`aws-transport-fingerprints.mts`, not a copy of the string list in a new consumer file. A new
AWS-facing command/action consumer is still a new rule under the
[scoped invariants](CLAUDE.md#scoped-invariants), while terminal variants from the same consumer and
root cause belong in one rule. Each consumer calls the same shared predicate instead of inlining its
own marker list.
