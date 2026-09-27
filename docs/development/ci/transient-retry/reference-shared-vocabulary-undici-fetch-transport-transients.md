# Shared Vocabulary: undici/fetch Transport Transients

[Back to Transient-Retry Rule Catalogue](README.md)

Any consumer that calls `fetch()` (backed by Node's undici) can fail with the same family of
low-level transport errors regardless of which external host it targets — the Cloudflare Worker
staging evidence burst is the first observed case. `undici-transport-fingerprints.mts` exports
`hasUndiciConnectTimeout(text)`, matching undici's `TypeError: fetch failed` wrapper together
with its `ConnectTimeoutError: Connect Timeout Error` cause and `UND_ERR_CONNECT_TIMEOUT` code —
the same "anchor to your own terminal marker first, then call the shared predicate on that slice"
rule from the AWS transport vocabulary above applies here. `hasUndiciSocketClosed(text)` matches
the same `TypeError: fetch failed` wrapper with `SocketError: other side closed` and
`UND_ERR_SOCKET`. A newly observed undici transport variant (header timeout, body timeout) is a
genuinely new member of this root-cause class — add it as a new named predicate inside
`undici-transport-fingerprints.mts`, not a copy of the marker list in a new consumer file.
