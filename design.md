# Design — ani-desk

A locked design system for the private family app. Every screen redesign reads
this file before changing layout or visual behavior. Extend this system when a
new product surface is added; do not invent a per-screen theme.

## Product context

- Audience: a family of 5–10 authenticated users across desktop and mobile web.
- Primary job: choose a provider, search that provider's distinct catalog, and
  start or resume an episode.
- Voice: cinematic, direct, calm, and operationally honest.
- Brand: preserve the ani-desk name and logo. The icon sits on black.

## Genre

Cinematic atmospheric. Liquid Glass is an interaction material, not a page
decoration: use it for navigation, controls, sheets, menus, and contextual
panels. Content rails and poster art remain visually solid and legible.

## Macrostructure family

- Authentication: **Split Studio** — brand/art field paired with a compact,
  security-first login surface. On phones this becomes one vertical flow.
- Discovery: **Ecosystem Index** — Continue Watching, provider-scoped discovery,
  and saved content are distinct rails with unequal visual priority.
- Search, provider setup, settings, downloads, and episode detail: **Workbench**
  — the active task is primary; configuration and context stay adjacent.
- Operations documentation: **Long Document** — command-oriented prose with
  diagrams and failure playbooks, not coding documentation.

Desktop navigation uses a compact side rail. Mobile navigation uses a safe-area
bottom bar with no more than five destinations; secondary actions live in a
sheet. App screens do not add marketing footers.

## Theme — Obsidian Cinema

- `--color-paper` oklch(9% 0.014 28)
- `--color-paper-2` oklch(14% 0.018 28)
- `--color-paper-3` oklch(20% 0.020 28)
- `--color-ink` oklch(96% 0.010 30)
- `--color-ink-2` oklch(77% 0.012 30)
- `--color-rule` oklch(32% 0.018 28)
- `--color-rule-2` oklch(25% 0.016 28)
- `--color-muted` oklch(62% 0.014 28)
- `--color-neutral` oklch(45% 0.014 28)
- `--color-accent` oklch(64% 0.20 25)
- `--color-accent-ink` oklch(12% 0.015 28)
- `--color-focus` oklch(70% 0.20 25)

Theme axes: **dark / display-condensed-bold / warm**.

Accent is limited to the active provider, primary action, focus state, progress,
and the small brand mark. Cyan and amber are removed from general decoration.
Semantic warning/success colors may appear only where status must be understood.

## Variants

- **Obsidian Cinema** is the default shared palette.
- **OLED Theatre** lowers paper/surface lightness for dark rooms without using
  pure black or changing the red brand anchor.
- **Device Contrast** keeps the same palette and increases rule, surface, and
  muted-text separation only when the device requests more contrast.

Variants may change these token lightness values only. They do not change font,
spacing, route layout, provider state language, or brand placement.

## Typography

- Display: Barlow Condensed, weight 700, style normal.
- Body: Manrope, weights 400/500/650, style normal.
- Mono: IBM Plex Mono, weights 400/500.
- Display tracking: -0.025em.
- Body measure: 45–70 characters for prose; task UI may be denser.
- Display headings are roman. No italic headings.

Fonts must be bundled with the app so the hosted edition does not depend on a
third-party font CDN.

## Spacing

A 4-point named scale lives in `tokens.css`. Screen CSS uses semantic tokens,
not raw spacing values. Desktop content respects the macOS traffic-light area;
mobile content respects all safe-area insets.

## Motion

- Route change: opacity crossfade only.
- Selection change: short opacity plus transform transition.
- Shared search transition: retained only when it clarifies continuity.
- No repeating ambient animation, bounce, overshoot, or layout-property motion.
- Reduced motion: opacity-only, at most 150 ms.

## Microinteractions stance

- Silent success for saves, provider changes, and settings.
- Optimistic updates with Undo where data can be removed.
- Focus rings appear instantly and remain visible against every surface.
- Provider health is explicit: Healthy, Limited, Verify, or Offline.
- Loading never hides the currently usable provider choice.

## CTA voice

- Primary: compact red fill, 8–12 px radius, verb-first label such as `Play`,
  `Resume`, `Search AllAnime`, or `Save changes`.
- Secondary: neutral glass or quiet outline; never competes with playback.
- Destructive: text/outline first, confirmation only for irreversible actions.

## Screen rules

### Login

Keep username/password login. Explain that accounts are private to the family
server. Do not imply OAuth, SSO, or recovery features that do not exist.

### Home and catalog

Continue Watching is first when populated. Discovery rails show the provider
context when results came from a provider. Posters never hide essential labels
behind hover-only interactions.

### Provider search

Provider-first is mandatory. The selected provider is chosen before search;
switching provider preserves the query and runs a new provider-specific search.
Results from different provider catalogs are never silently merged.

### Provider configuration

Use a dedicated settings surface for language, priority, health, verification,
and fallback behavior. A provider may remain visible while requiring manual
verification. Do not label a provider healthy until a real media probe passes.

### Episode selection

Keep range navigation for long series. On desktop, episode list and title context
share a workbench. On phones, title context collapses above a full-width episode
list; controls remain reachable with one thumb.

### Player and downloads

The player is distraction-free. Provider, quality, subtitles, download, and
fallback actions sit in one contextual control sheet. Download state is visible
without blocking playback.

## Responsive contract

Verify 320, 375, 414, 768, 1100, 1440, and 1728 px widths. There is no horizontal
page scroll. Interactive targets are at least 44×44 px on touch layouts. Text
buttons and primary navigation labels do not wrap. Image grids use
`minmax(0, 1fr)`. Desktop-only hover behavior always has a touch equivalent.

## Security and hosted-web contract

- Hosted access stays authenticated and account data remains per-user.
- Production cookies are Secure, HttpOnly, and SameSite-protected behind HTTPS.
- The service is exposed through a TLS reverse proxy or private overlay network,
  not by publishing its raw application port to the internet.
- Provider credentials or changing protocol constants never enter frontend code.
- Logs redact cookies, passwords, media tokens, and signed provider URLs.

## What screens must share

- Logo, black icon background, red accent placement, typography, focus treatment,
  navigation model, button voice, provider status language, and glass material.
- Query persistence and provider-first search semantics.
- Mobile safe-area behavior and touch target sizes.

## What screens may differ

- Discovery rail density and poster proportions.
- Workbench pane count: three on large desktop, two on compact desktop, one on
  phones.
- Art backdrop intensity. Functional screens use less art than discovery.

## Exports

### tokens.css

`tokens.css` at the repository root is the canonical export.

### Tailwind v4 `@theme`

```css
@theme {
  --color-paper: oklch(9% 0.014 28);
  --color-paper-2: oklch(14% 0.018 28);
  --color-paper-3: oklch(20% 0.020 28);
  --color-ink: oklch(96% 0.010 30);
  --color-ink-2: oklch(77% 0.012 30);
  --color-rule: oklch(32% 0.018 28);
  --color-muted: oklch(62% 0.014 28);
  --color-accent: oklch(64% 0.20 25);
  --color-focus: oklch(70% 0.20 25);
  --font-display: "Barlow Condensed", sans-serif;
  --font-body: "Manrope", sans-serif;
  --font-outlier: "IBM Plex Mono", monospace;
  --spacing-sm: 1rem;
  --spacing-md: 1.5rem;
  --spacing-lg: 2rem;
  --text-md: 1rem;
  --text-lg: 1.25rem;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### DTCG `tokens.json`

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "color": {
    "paper": { "$value": "oklch(9% 0.014 28)", "$type": "color" },
    "paper-2": { "$value": "oklch(14% 0.018 28)", "$type": "color" },
    "paper-3": { "$value": "oklch(20% 0.020 28)", "$type": "color" },
    "ink": { "$value": "oklch(96% 0.010 30)", "$type": "color" },
    "muted": { "$value": "oklch(62% 0.014 28)", "$type": "color" },
    "accent": { "$value": "oklch(64% 0.20 25)", "$type": "color" },
    "focus": { "$value": "oklch(70% 0.20 25)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Barlow Condensed, sans-serif", "$type": "fontFamily" },
    "body": { "$value": "Manrope, sans-serif", "$type": "fontFamily" },
    "outlier": { "$value": "IBM Plex Mono, monospace", "$type": "fontFamily" }
  },
  "space": {
    "sm": { "$value": "1rem", "$type": "dimension" },
    "md": { "$value": "1.5rem", "$type": "dimension" },
    "lg": { "$value": "2rem", "$type": "dimension" }
  }
}
```

### shadcn/ui CSS variables

```css
:root {
  --background: 9% 0.014 28;
  --foreground: 96% 0.010 30;
  --card: 14% 0.018 28;
  --card-foreground: 96% 0.010 30;
  --popover: 14% 0.018 28;
  --popover-foreground: 96% 0.010 30;
  --primary: 64% 0.20 25;
  --primary-foreground: 12% 0.015 28;
  --secondary: 20% 0.020 28;
  --secondary-foreground: 96% 0.010 30;
  --muted: 25% 0.016 28;
  --muted-foreground: 62% 0.014 28;
  --border: 32% 0.018 28;
  --input: 32% 0.018 28;
  --ring: 70% 0.20 25;
  --radius: 10px;
}
```
