# Live browser preflight

Before finalizing a Plan, determine whether its verification requires a supported interactive browser. Every Plan issue must contain exactly one allowed status (`not-required`, `available`, or `exception`).

Use `not-required` when no live visual QA is required:

```markdown
## Live browser preflight

- Status: `not-required`
```

Use `available` only after a successful browser discovery or binding call:

```markdown
## Live browser preflight

- Status: `available`
- Surface: Supported interactive browser
- Evidence: Opened and inspected the planned UI route.
```

Use `exception` when the supported interactive browser is unavailable:

```markdown
## Live browser preflight

- Status: `exception`
- Reason: No supported interactive browser is available in this session.
```

Human acceptance of an `exception` explicitly accepts omitting live visual QA. Automated Chromium, Playwright, or Storybook capability does not establish interactive browser availability.
