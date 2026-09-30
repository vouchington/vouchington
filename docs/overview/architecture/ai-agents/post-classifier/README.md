# Post classifier

`@agents/post-classifier` classifies already approved posts and applies automatic topic votes and
tags. It does not decide safety, spam, clearance, review, or publication.

`buildPostClassifierInput` sanitizes and wraps the post state, verifies the exact enabled topic
catalog, and produces one bounded remote Noul request. Local-only configurations make no provider
request. Missing, partial, malformed, duplicate, or catalog-drifted results fail closed.

`executePostClassifierOutcomes` records local-detector and remote decision outcomes for a claimed
receipt without applying tags or votes itself. The fixed OpenRouter/Jev client performs shared spend
admission before the durable attempt reservation and records a billed response before decoding.
The post-classifier worker reserves one receipt before enqueue, revalidates the approved revision
and configuration fingerprint on primary storage, then applies durable votes and tags. A changed
revision or configuration supersedes its obsolete receipt and reserves the current fingerprint;
completed-receipt replays never make another provider request.

The provider client is built inside the recorded failure path. A missing `OPENROUTER_API_KEY` or
any other construction failure ends the receipt's remote half as terminal `client-unavailable`,
persists the local detector outcome in the same write, and raises one
`post_classifier_receipt_alarm` Sentry message instead of throwing into the queue retry loop; the
recovery sweep then leaves the receipt alone. Remote-side alarms and the receipt-age alarm are
owned going forward by C12 (#225).

```mermaid
flowchart LR
  post[Approved post] --> state[Sanitized post state]
  state --> local[Optional local detector]
  state --> remote[Optional Noul batch]
  local --> receipt[Atomic outcome receipt]
  remote --> receipt
  receipt --> effects[Votes and topic tags]
```
