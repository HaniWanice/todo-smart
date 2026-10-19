---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["style.css","src/app.js"]
---

## Scope

Main (and only) screen of ToDo Smart: composer, current view with filters, task list, bottom tab bar. Mode: Operate.

## Task

Capture an idea in seconds (Shift+Enter), sort into 3–6 tabs, mark in progress / done, find favourites and pinned items. Volumes are small (~10 tasks per tab).

## Direction contract

THESIS: A calm writing surface where capture is the page's anchor and tabs live under the thumb at the bottom; it refuses the dense sidebar + compact list arrangement of classic to-do apps.

OWN-WORLD: Soft warm paper ground (#f8f7f4), near-white raised composer, warm graphite text (#37352f), Notion's nine soft label colours as tab identities, one blue accent for primary action and selection, amber for "En cours", green for done. Thin 1.75 stroke icons, hairline separators, 10–14px radii, system sans. Warm charcoal dark mode (#191919).

STORY: The owner types without choosing anything, sees where it lands ("dans Trading"), finds it again by tab, star or pin, and sees what is in progress at a glance.

FIRST VIEWPORT: Slim top bar (brand left; search, sync, share, theme right). Full-width composer card with 18px input, format buttons left, destination + blue "Ajouter (Maj ↵)" right. Below, a large view title (32–36px) with tab colour tile and status counts, filter chips right-aligned. Airy task rows (16px vertical padding, hairline separators). Fixed bottom bar with 48px tabs, colour squares, counts, dashed "Nouvel onglet".

FORM: Pinned by the user (Notion-like soft light + dark toggle); no roll. seed: none (direction pinned by user, no roll)

Signature interaction: hovering a task blooms its description preview after a short intent delay (3-line clamp); dragging a task's grip lights the target tab in its own colour.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

None.
