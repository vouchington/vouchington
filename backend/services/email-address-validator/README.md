# @services/email-address-validator

Email address validation and sanitization, including domain-level DNS/MX checks and disposable email detection.

## Key exports

- `validateEmailAddress(email, env?)` — validates format, checks MX records, and rejects disposable domains; throws a structured error on failure
- `sanitizeEmailAddress(email, env?)` — lowercases and trims; in a deployed environment (staging or production) also strips `+tag` from the local part so account dedup matches production. `env` defaults to `process.env`; tests pass an explicit source instead of mutating ambient `ENVIRONMENT`
- `validateEmailDomain(domain)` — standalone domain-level MX check

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Users service: [../users/README.md](../users/README.md)
