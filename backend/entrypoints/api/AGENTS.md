# API entrypoint

- Add context helpers through `app.extend()` in [`backend/api/context`](../../api/context/).
- Bootstrap `enableApiEgressGuardrail()` only here, never in worker entrypoints.
- Keep route registration lightweight using candidate sub-app groups.
- The GlideMQ dashboard event stream ends through `armDashboardEventStream`; do not arm the
  package job-output route, which already ends after a bounded read.
