# Backend test helpers

- Expose focused setup/assertions here without re-exporting SQL methods. Entity helpers use
  `entities/*.mts`; generic helpers stay with narrow package owners.
- Owned post-election and vote-route admission on the default project budget uses
  `admissionObservationDeadline`, the same bound as `waitForRealGlideEvent`, so a stalled owned
  job is named before that budget. User-vouch observation keeps a longer deadline because its
  callers set a longer per-test timeout and the observation outlasts the default budget. The
  entity-listener lifetime outlasts the default project budget: teardown abort names cleanup
  after the test finishes, and a stall during the body surfaces as the runner timeout.
