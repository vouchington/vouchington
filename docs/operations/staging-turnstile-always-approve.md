# Staging Turnstile Test Mode

This staging-only test mode lets authorized QA exercise protected flows without
production challenge behavior. Configuration values, operator commands, and
environment endpoints are maintained in the private `vouchington-infra`
runbook.

## Safety contract

- Enable the mode only in the explicitly authorized non-production environment
  and only for a bounded QA window.
- Verify the environment before and after the change; production continues to
  require normal verification.
- Do not copy site keys, tokens, hostnames, or provider controls into tickets
  or public documentation.
- Revert after QA and verify normal challenge behavior.

Record authorization, window, validation result, and reversion result in the
private operator record.
