# Backend test helpers

- Load skills: `vouchington-backend-tests`, `test-authoring`, `testing-rules`.
- Expose focused setup/assertions here without re-exporting SQL methods. Entity helpers use
  `entities/*.mts`; generic helpers stay with narrow package owners.
- Owned admission waits on the default project budget use `admissionObservationDeadline`; longer callers pass their own deadline.
