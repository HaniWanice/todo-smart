---
name: ToDo Smart
description: Calm, airy capture surface for tasks and ideas, synced by link.
colors:
  paper: "#f8f7f4"
  surface: "#fdfdfc"
  raised: "#ffffff"
  graphite: "#37352f"
  graphite-soft: "#5f5e5b"
  muted: "#73716c"
  faint: "#b4b2ad"
  accent: "#1f6fc5"
  doing: "#c4851c"
  done: "#448361"
  star: "#d9a21b"
  danger: "#d44c47"
  night: "#191919"
  night-surface: "#1f1f1f"
  night-text: "#e3e2df"
  night-accent: "#5aa3e0"
  label-blue: "#337ea9"
  label-blue-bg: "#e7f3f8"
  label-green: "#448361"
  label-green-bg: "#edf3ec"
  label-orange: "#d9730d"
  label-orange-bg: "#fbecdd"
  label-purple: "#9065b0"
  label-purple-bg: "#f6f3f9"
typography:
  view-title:
    fontFamily: "ui-sans-serif, -apple-system, Segoe UI Variable Text, Segoe UI, Roboto, sans-serif"
    fontSize: "clamp(28px, 2.6vw, 36px)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  composer:
    fontFamily: "ui-sans-serif, -apple-system, Segoe UI Variable Text, Segoe UI, Roboto, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.55
  task-title:
    fontFamily: "ui-sans-serif, -apple-system, Segoe UI Variable Text, Segoe UI, Roboto, sans-serif"
    fontSize: "16.5px"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "ui-sans-serif, -apple-system, Segoe UI Variable Text, Segoe UI, Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "ui-sans-serif, -apple-system, Segoe UI Variable Text, Segoe UI, Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "14px"
  pill: "999px"
spacing:
  row-y: "16px"
  gap: "16px"
  pad-x: "clamp(20px, 4.5vw, 72px)"
  tabbar: "76px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.raised}"
    rounded: "{rounded.sm}"
    height: "38px"
    padding: "0 14px 0 16px"
  chip-filter:
    textColor: "{colors.graphite-soft}"
    rounded: "{rounded.pill}"
    height: "36px"
    padding: "0 14px 0 11px"
  tab:
    textColor: "{colors.graphite-soft}"
    rounded: "{rounded.lg}"
    height: "48px"
    padding: "0 18px 0 14px"
  composer:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    typography: "{typography.composer}"
  task-row:
    rounded: "{rounded.lg}"
    padding: "16px"
    typography: "{typography.task-title}"
---

# Design System: ToDo Smart

## Overview

**Creative North Star: "The Quiet Notebook"**

A warm sheet of paper that is always open at the right page. The surface stays almost silent: warm off-white ground, graphite ink, hairline separators, and generous air between items, because the owner only keeps a handful of tasks per tab and wants to breathe, not scan a dense table. The composer is the anchor of the page; everything else waits underneath it.

Colour does work, never decoration. Each tab owns one of Notion's soft label colours and carries it everywhere it appears (bottom bar, view tile, task chip, drop target). One blue accent marks the primary action and selection, amber means in progress, green means done. Dark mode is warm charcoal, not blue-black.

**Key Characteristics:**
- Warm paper ground, never pure white behind content.
- Big targets: 48px tabs, 30px state buttons, 16px row padding.
- Structure from hairlines and space, not boxes.
- Navigation sits under the thumb in a fixed bottom bar.
- Actions appear on hover on desktop and are always visible on touch.

## Colors

A restrained, warm palette with one functional accent and nine soft identity colours for tabs.

### Primary
- **Ink Blue** (#1f6fc5): the "Ajouter" button, selected filter chips, focus rings, checked checklist boxes, pinned icon. Dark mode uses #5aa3e0.

### Secondary
- **Amber In-Progress** (#c4851c): the "En cours" ring, pill and filled half-circle.
- **Leaf Done** (#448361): the done ring and synced dot.
- **Star Gold** (#d9a21b): a filled star on favourite tasks.

### Neutral
- **Warm Paper** (#f8f7f4): page ground.
- **Composer White** (#fdfdfc) and **Raised White** (#ffffff): the composer card and description well.
- **Graphite** (#37352f): primary text. **Graphite Soft** (#5f5e5b): secondary text in tabs and chips.
- **Pencil Grey** (#73716c): meta text, icons and placeholders (4.5:1 on paper).
- **Faint Grey** (#b4b2ad): the drag grip and hairline accents only, never text.
- Hairlines are `rgba(55, 53, 47, .09)`; hover wash is `rgba(55, 53, 47, .045)`.

### Tab identity colours
Nine pairs (gray, brown, orange, yellow, green, blue, purple, pink, red), each a text colour plus a pale background, from Notion's label set. They have light and dark variants as CSS variables `--c-<name>` and `--c-<name>-bg`.

### Named Rules
**The Label Carries Its Colour Rule.** A tab's colour follows it everywhere: dot in the bar, active tab background, view tile, task chip, drop highlight. No other element borrows a tab colour.

**The One Accent Rule.** Blue is only for the primary action, selection and focus. State uses amber and green, never blue.

## Typography

**Body Font:** the platform UI sans (ui-sans-serif, -apple-system, Segoe UI Variable, Roboto).

**Character:** one familiar workhorse face, tuned for calm reading; hierarchy comes from size and weight, never from a second family.

### Hierarchy
- **View title** (700, clamp(28px, 2.6vw, 36px), 1.2, -0.02em): the open tab's name; click it to rename.
- **Composer** (400, 18px, 1.55): the capture field. Its first line is set at 500.
- **Task title** (400, 16.5px, 1.55, max 80ch): one task.
- **Body** (400, 15px, 1.6): descriptions.
- **Label** (500, 13–15px): tabs, chips, meta and dates. Dates use tabular numerals.

## Layout

The page is full width with fluid side padding (`clamp(20px, 4.5vw, 72px)`). Text measures are capped at 80ch inside rows, so long lines stay readable while row actions sit at the right edge. The vertical order is: slim top bar, composer card, large view title with counts, filter chips on the right, task list. The list has 4px gaps and a hairline between rows. The bottom tab bar is fixed (76px, 68px on mobile), and the main area reserves space for it.

At 760px and below, the filters and tabs become horizontal scroll strips with a fade at the edge. Row actions move under the title. The composer drops the destination label and keyboard hint, but the "Ajouter" button stays.

## Elevation & Depth

The page is mostly flat and uses tonal layering. Two soft shadows only:
- **Rest** (`0 1px 2px rgba(15,15,15,.04), 0 2px 8px rgba(15,15,15,.04)`): the composer at rest.
- **Lifted** (`0 2px 4px rgba(15,15,15,.05), 0 12px 32px rgba(15,15,15,.10)`): the focused composer, menus, the format bar, and toasts.

**The Lift On Intent Rule.** Shadows grow only when something takes focus or floats above the page. Rows never get shadows; hover is a tonal wash.

## Shapes

Gently rounded corners, scaled to the size of the element: 6px for chips in rows, 8px for icon buttons, 10px for menus, 12px for rows and tabs, 14px for the composer, and full pills for filters. Checklist boxes are 5px squares. Borders are hairlines; the only dashed border is the "Nouvel onglet" button, which invites an action.

## Components

### Composer
The anchor of the page. It is a white card with a hairline border and a rest shadow, and it lifts on focus. Enter starts a new line; Shift+Enter or "Ajouter" saves. Format buttons (B, I, list, checklist) sit on the left, and the destination tab name in its own colour sits on the right.

### Buttons
- **Primary "Ajouter":** Ink Blue, white text, 8px radius, 38px tall, with a `Maj ↵` keycap. It darkens on hover. When the field is empty it is disabled at 45% opacity.
- **Icon buttons:** 32–34px squares with an 8px radius. Pencil Grey, with a hover wash.

### Task row
- Grip (on hover), then a **done** button (solid ring, green check on hover or when done) and an **in progress** button (dashed ring, half-filled amber when active).
- The title, then meta: a tab chip in "Tout" and "Favoris" views, an "En cours" pill, and the full creation date.
- **Signature:** on hover, after a 180ms intent delay, the description preview opens in a white well, clamped to 3 lines. Clicking it opens the full description for editing.
- Actions on the right: star, pin, description, move, delete. Star and pin stay visible once set.

### Chips (filters)
These are pills with a hairline border. When pressed they show an Ink Blue tint with no border. Several can be on at once; "Effacer" clears them.

### Navigation (bottom tab bar)
48px tabs: "Tout" and "Favoris", a divider, then the user tabs (colour square, name, count), then a dashed "+ Nouvel onglet" button. The active tab takes its own pale colour. Tabs can be reordered by dragging, and dropping a task on a tab outlines that tab in its colour.

### Format bar
A floating toolbar that appears above any selection in an editor: B, I | Liste, Checklist.

## Do's and Don'ts

### Do:
- **Do** keep tasks airy: 16px row padding and at least 4px between rows.
- **Do** give every action a visible button; keyboard shortcuts come in addition, never instead.
- **Do** use a tab's own colour pair for anything that represents that tab.
- **Do** theme both modes through the CSS variables in `:root` and `:root[data-theme="dark"]`.

### Don't:
- **Don't** use typed syntax as the way to format text (no hashtags, no Markdown typing required); formatting comes from buttons, shortcuts or the selection bar.
- **Don't** use pure white (#fff) as the page ground or pure black in dark mode.
- **Don't** add cards, borders or density around rows; the owner asked for space.
- **Don't** use Faint Grey (#b4b2ad) for text or for always-visible controls.
