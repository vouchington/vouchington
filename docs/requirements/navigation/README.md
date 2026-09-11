# Navigation

Routes, navigation patterns, UI components, keyboard shortcuts, accessibility, and mobile.

## Documents

| File                                              | Description                                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [Routes](./ROUTES.md)                             | Route structure, navigation, and relocation audit                                            |
| [Navigation](./NAVIGATION.md)                     | Intent-based navigation: vocabulary, taxonomy, route→intent resolution, and visibility rules |
| [App Navigation](./APP-NAVIGATION.md)             | Native app bottom bar, verticals, sub-options, omnisearch, and customization                 |
| [Sidebar](./SIDEBAR.md)                           | Sidebar navigation content and rules                                                         |
| [Topbar & Search](./TOPBAR-SEARCH.md)             | Search bar, suggestions, and topbar layout                                                   |
| [Feed & List Filters](./FEED-LIST-FILTERS.md)     | Feed/post/news filter controls, combined `#topic` search, and responsive dropdown rules      |
| [Asides](./ASIDES.md)                             | Per-page right sidebar content via AsideProvider pattern                                     |
| [Actions](./ACTIONS.md)                           | Action button principles, placement rules, report-table matrix, and tooltip requirements     |
| [Signed-out Actions](./SIGNED_OUT_ACTIONS.md)     | Which buttons are visible to anonymous users and what happens on click                       |
| [UI Components](./COMPONENTS.md)                  | shadcn/ui component patterns, loading states, and design guidelines                          |
| [Entity × Action Icons](./ENTITY-ACTION-ICONS.md) | Canonical icon choices for user-facing entity/action controls                                |
| [Keyboard Shortcuts](./KEYBOARD-SHORTCUTS.md)     | Keyboard shortcut definitions and Cmd+K palette                                              |
| [Mobile](./MOBILE.md)                             | Mobile responsiveness requirements                                                           |
| [Dynamic Rendering](./DYNAMIC-RENDERING.md)       | SSR vs streaming pattern for logged-out/logged-in users                                      |
| [Accessibility](./ACCESSIBILITY.md)               | WCAG 2.2 compliance requirements                                                             |
| [Notifications](./NOTIFICATIONS.md)               | Browser push notifications and in-app notification UI                                        |

## Sync Rule

When route shapes, navigation intents, or UI component APIs change, update the relevant doc here
and cross-link from `web/CLAUDE.md` and the relevant page or component.

## Guard-pinned files

Two files in this folder are pinned by static-analysis guards — edits must keep code and docs in sync or CI fails:

- **[ROUTES.md](./ROUTES.md)** — `static-code-analysis/repo-file-policy/route-admin-surface-guard.mts` validates that every admin surface in `ROUTES.md#route-relocation-audit` has a corresponding admin nav entry.
- **[ACTIONS.md](./ACTIONS.md)** — `static-code-analysis/repo-file-policy/moderation-policy-doc-sync-guard.mts` checks that the report-table entity-type list in `ACTIONS.md` stays in sync with the moderation policy docs (`../moderation/`). This is a cross-cluster dependency: ACTIONS lives here but is validated by the moderation guard.
