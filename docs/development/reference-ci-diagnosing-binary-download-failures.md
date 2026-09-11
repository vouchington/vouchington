# Diagnosing Binary Download Failures

[Back to CI Reference](ci.md#diagnosing-binary-download-failures)

Repo-owned external binary download steps print `DOWNLOAD FAILED: <url> → HTTP <status>` to the
job log and `$GITHUB_STEP_SUMMARY` before exiting. To locate the failed URL and status from a
failed run:

```bash
gh run view --log-failed | grep 'DOWNLOAD FAILED'
```

`HTTP 000` means curl failed before receiving an HTTP response, such as a DNS, TLS, timeout, or
connection failure. Downloads performed inside third-party actions may still require inspecting
that action's own failed step log.
