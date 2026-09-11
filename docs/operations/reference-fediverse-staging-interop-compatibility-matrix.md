# Compatibility Matrix

[Back to Fediverse Staging Interoperability - Runbook](fediverse-staging-interop.md#compatibility-matrix)

Test every `Validate` cell. Record `unsupported` when the remote software has no UI or actor model
for the action. Do not turn that into a Voucha pass or failure.

| Capability                                                       | Voucha contract                                                           | Mastodon                 | Lemmy                    | PeerTube                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------ | ------------------------ | ------------------------ |
| NodeInfo, WebFinger, actor discovery                             | Supported                                                                 | Validate                 | Validate                 | Validate                 |
| Remote actor follows Voucha `Person`                             | Supported when remote software can initiate it                            | Validate                 | Validate or unsupported  | Validate or unsupported  |
| Voucha sends `Accept` for inbound `Follow`                       | Supported                                                                 | Validate                 | Validate after Follow    | Validate after Follow    |
| Remote `Undo(Follow)` removes relation                           | Supported                                                                 | Validate                 | Validate after Follow    | Validate after Follow    |
| Signed Voucha activity reaches an existing remote follower inbox | Transport supported                                                       | Validate HTTP acceptance | Validate HTTP acceptance | Validate HTTP acceptance |
| Remote user likes a Voucha post through a normal remote workflow | Unsupported: Voucha posts are not published or dereferenceable AP objects | Unsupported              | Unsupported              | Unsupported              |
| Voucha user directly follows a remote actor                      | Unsupported: no local-user-to-remote-actor relation                       | Unsupported              | Unsupported              | Unsupported              |
| Voucha user directly likes a remote object                       | Unsupported: no persisted remote-object target                            | Unsupported              | Unsupported              | Unsupported              |
