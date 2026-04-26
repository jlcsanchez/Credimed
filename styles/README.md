# Credimed app-shell

Drop-in desktop layout shell for the four high-traffic app pages.
Wraps existing page content; preserves every script, id, and data-attribute.

## Files

- `styles/app-shell.css` — the shell CSS (one file, no JS dependencies)
- `app-shell-integration.html` — visual reference showing the markup pattern

## Quick start

In each app page (dashboard.html, claim.html, documents.html, admin.html):

1. Add `<link rel="stylesheet" href="styles/app-shell.css" />` (or relative path).
2. Set `<body data-page="…">` to one of: `dashboard`, `claims`, `claim`, `documents`, `profile`, `admin`.
3. Wrap your existing body content with the shell scaffold (see `app-shell-integration.html`).
4. Move existing page content INSIDE `<main class="app-main">…</main>`. Do not edit it.

That's it. No JS to load, no init call.

## Class contract

| Class | Where | What it does |
|---|---|---|
| `.app-shell` | wrapper `<div>` | Root grid container |
| `.app-shell.has-panel` | wrapper `<div>` | Opt in to right panel (visible ≥ 1280 px) |
| `.app-topbar` | mobile top bar | Visible **only** < 768 px |
| `.app-sidebar` | left sidebar | Visible ≥ 768 px (icon-only 768–959, full ≥ 960) |
| `.app-main` | main slot | Existing page content lives here |
| `.app-main--padded` | optional modifier | Adds shell padding (24/32/40 px) |
| `.app-main-inner` | optional helper | Centered, max-width 1080 px |
| `.app-main-inner--reading` | optional helper | Centered, max-width 720 px |
| `.app-panel` | right panel | Visible **only** ≥ 1280 px when `.has-panel` is on |
| `.app-bottomnav` | mobile bottom nav | Visible **only** < 768 px |
| `.app-skip-link` | a11y skip link | Hidden until focused |

### Sidebar internals

| Class | What |
|---|---|
| `.sb-brand` | logo block at the top |
| `.sb-mark` | the round H mark (32 px circle, teal-600) |
| `.sb-name` | the "CREDIMED" wordmark |
| `.sb-section` / `.sb-label` | nav group + uppercase label |
| `.sb-nav` | nav list container |
| `.sb-link` | nav item — works as `<a>` or `<button>` |
| `.sb-link[data-nav="…"]` | active-state hook (see below) |
| `.sb-link .badge` | small teal pill (e.g., claim count) |
| `.sb-spacer` | flex spacer to push footer down |
| `.sb-foot` | bottom group (support, sign-out, user card) |
| `.sb-user` / `.sb-avatar` / `.sb-user-name` / `.sb-user-meta` | user card |

### Panel internals

| Class | What |
|---|---|
| `.panel-section` | one block of content (with bottom margin) |
| `.panel-title` | the small uppercase header |

## Active nav state

The CSS reads `body[data-page]` and matches it against `data-nav` on each `.sb-link` (and each `.app-bottomnav a`). **Do not** add `.active` manually — set the body attribute and you're done.

| `data-page` value | Activates `data-nav` |
|---|---|
| `dashboard` | `dashboard` |
| `claims` *(list view, if any)* | `claims` |
| `claim` *(detail view)* | `claims` |
| `documents` | `documents` |
| `profile` | `profile` |
| `admin` | `admin` *(staff only — hide other nav items as you wish)* |

## Side panel — what to put in each

The panel is `display: none` below 1280 px. Anything critical must also live inside `.app-main`.

- **dashboard.html** → claim status timeline (use the `.tl` / `.tl-step` primitives if you want, or paste a custom block)
- **claim.html** → status timeline + quick actions (download PDF, message support, report problem)
- **admin.html** → recent activity feed (most-recent claim events, log lines)
- **documents.html** → omit `.has-panel`; the upload slots want all the horizontal space

## Breakpoints

| Width | Sidebar | Panel | Topbar | Bottom nav |
|---|---|---|---|---|
| `< 768 px` | hidden | hidden | **shown** | **shown** |
| `768–959 px` | icon-only (60 px) | hidden | hidden | hidden |
| `960–1279 px` | full (240 px) | hidden | hidden | hidden |
| `≥ 1280 px` | full (240 px) | shown when `.has-panel` (320 px) | hidden | hidden |

The mobile layout (< 768) is intentionally untouched — the topbar replaces the sidebar, the bottom nav handles primary navigation, and your existing iPhone-style page content fills the middle.

## Tokens

The shell **does not redeclare** the brand tokens. It assumes `:root` has `--teal-*`, `--slate-*`, `--cream`, `--cream-2` already defined (which every app page does). Fallback values are inlined as a safety net but should never trigger in practice.

## Integration checklist (per page)

- [ ] Link `app-shell.css` in `<head>`.
- [ ] Set `<body data-page="…">`.
- [ ] Wrap existing body in `<div class="app-shell"…>` (add `has-panel` for dashboard/claim/admin).
- [ ] Paste the topbar / sidebar / bottom-nav blocks from `app-shell-integration.html`.
- [ ] Move existing page content into `<main class="app-main">…</main>` — do not edit it.
- [ ] Hook the `#sign-out-btn` button to your existing sign-out flow.
- [ ] (Optional) Update `#sb-user-name` / `#sb-user-meta` / `#sb-user-initials` from `CredimedState`.
- [ ] If page has a side panel, populate `<aside class="app-panel">…</aside>`.

## Non-goals (by design)

- The shell **does not** include any JavaScript. Hook your existing handlers to the IDs.
- The shell **does not** style anything inside `.app-main`. Existing page CSS continues to win.
- The shell **does not** touch the < 768 px layout of existing content — only adds chrome around it.
