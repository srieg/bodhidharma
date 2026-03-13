# WCAG 2.1 AA Accessibility Audit

**Page:** Bodhidharma Buddhist Philosophy Knowledge Graph
**URL:** `http://localhost:8765/bodhidharma-knowledge-graph.html`
**Date:** 2026-02-22
**Standard:** WCAG 2.1 Level AA

---

## Executive Summary

The Bodhidharma Knowledge Graph is a visually striking, information-rich interactive visualization. However, it has **significant accessibility barriers** that would prevent users with disabilities from accessing its content. The primary concerns are: (1) the canvas-based graph is completely inaccessible to screen readers, (2) most interactive elements are not keyboard-accessible, (3) several color combinations fail contrast requirements, and (4) ARIA roles and semantic HTML are almost entirely absent.

---

## 1. Critical Issues (WCAG Failures - Must Fix)

### 1.1 Canvas Graph Has No Text Alternative
- **WCAG:** 1.1.1 Non-text Content (Level A)
- **Severity:** Critical
- **Element:** `<canvas>` element inside `#3d-graph` (line 1191)
- **Description:** The main knowledge graph is rendered on a `<canvas>` element via the force-graph library. It has no `alt` attribute, no `aria-label`, no `role`, and no fallback content. The canvas contains the primary content of the page -- 413 concepts and 472 relationships -- yet none of this information is available to screen readers.
- **Fix:** Add `role="img"` and an `aria-label` describing the graph at a high level. Provide a hidden accessible table or list of all concepts with their categories, connections, and definitions as fallback content inside the canvas element or in a separate accessible view.

### 1.2 Interactive Filter Chips Are Not Keyboard-Accessible
- **WCAG:** 2.1.1 Keyboard (Level A)
- **Severity:** Critical
- **Element:** `.chip` elements in `#chips-bar` (line 1187, JS line 1388-1398)
- **Description:** The 12 category filter chips (Practice, Doctrine, Philosophy, Person, Text Genre, Psychology, Attainment, Institution, Cosmology, Ethics, Path, Ritual) are `<div>` elements with click handlers but no `tabindex`, no `role`, no `aria-pressed`, and no keyboard event handlers. They cannot be reached or activated via keyboard.
- **Fix:** Add `role="button"`, `tabindex="0"`, `aria-pressed="true/false"`, and keydown handlers for Enter/Space to each chip.

### 1.3 Translate Button Is a Non-Focusable Div
- **WCAG:** 2.1.1 Keyboard (Level A)
- **Severity:** Critical
- **Element:** `#translate-btn` (line 1141) -- is a `<div>`, not a `<button>`
- **Description:** The translate button is a `<div>` with a click handler. It has no `tabindex`, no `role="button"`, and cannot be reached or activated via keyboard. The dropdown options (`.translate-option`) are also `<div>` elements without keyboard support.
- **Fix:** Change to `<button>` or add `role="button"` and `tabindex="0"`. The dropdown should use `role="menu"` with `role="menuitem"` on options, with arrow key navigation.

### 1.4 Panel Tabs Are Non-Focusable Divs
- **WCAG:** 2.1.1 Keyboard (Level A)
- **Severity:** Critical
- **Element:** `.panel-tab` elements (generated in JS around line 2210)
- **Description:** The Overview / Bibliography / Connections tabs in the detail panel are `<div>` elements with click handlers only. They have no `role="tab"`, no `tabindex`, no `aria-selected`, and no keyboard support.
- **Fix:** Implement the WAI-ARIA Tabs pattern: `role="tablist"` on container, `role="tab"` on each tab with `aria-selected`, `role="tabpanel"` on content areas, arrow key navigation between tabs.

### 1.5 Connection Items and Wiki Links Are Non-Focusable
- **WCAG:** 2.1.1 Keyboard (Level A)
- **Severity:** Critical
- **Element:** `.connection-item` (line 2187-2195), `.panel-wiki-link` (line 2206), `.wiki-connection-link` (line 2599), `.wiki-back` (line 2607)
- **Description:** These interactive elements use `<div>`, `<span>`, or `<a>` without `href` and rely on `onclick` handlers. None are keyboard-focusable or activatable.
- **Fix:** Use `<button>` elements or add `role="button"` with `tabindex="0"` and Enter/Space key handlers. For `.wiki-connection-link`, use proper `<a href>` elements.

### 1.6 `--text-muted` (#4a4540) Fails Contrast on All Backgrounds
- **WCAG:** 1.4.3 Contrast (Minimum) (Level AA)
- **Severity:** Critical
- **Element:** Multiple elements using `var(--text-muted)` / `#4a4540`
- **Description:** The `--text-muted` color is used for section titles (`.panel-section-title`), stats bar dim text (`.stats-line .dim`), search placeholder text, translate section labels, and shortcut close hints. Measured contrast ratios:
  - `#4a4540` on `#0a0a0f` (--bg): **2.08:1** (requires 4.5:1)
  - `#4a4540` on `#12121a` (--bg2): **1.97:1** (requires 4.5:1)
  - `#4a4540` on `#1a1a26` (--bg3): **1.82:1** (requires 4.5:1)
  - `#4a4540` on `#0d0d14` (stats bar): **2.04:1** (requires 4.5:1)
- **Fix:** Increase `--text-muted` to at least `#807b76` (~4.5:1 ratio) or restructure so this color is only decorative.

### 1.7 Search Input Has No Accessible Label
- **WCAG:** 1.3.1 Info and Relationships (Level A), 4.1.2 Name, Role, Value (Level A)
- **Severity:** Critical
- **Element:** `#search-input` (line 1138)
- **Description:** The search input has a `placeholder` ("Search concepts, Sanskrit, Tibetan...") but no `<label>`, `aria-label`, or `aria-labelledby`. Placeholder text alone does not constitute an accessible name per WCAG.
- **Fix:** Add `aria-label="Search concepts"` or a visually-hidden `<label for="search-input">`.

---

## 2. Major Issues (Significant Barriers)

### 2.1 `--text-dim` (#7a7570) Fails Contrast at Small Sizes on bg3
- **WCAG:** 1.4.3 Contrast (Minimum) (Level AA)
- **Severity:** Major
- **Element:** Text using `var(--text-dim)` on `var(--bg3)` backgrounds
- **Description:** The `--text-dim` color is used extensively for secondary text (subtitle, stats, connection weights, toggle labels, shortcut descriptions). Contrast ratios:
  - `#7a7570` on `#0a0a0f`: **4.33:1** -- PASSES (barely)
  - `#7a7570` on `#12121a`: **4.09:1** -- FAILS for text under 18pt
  - `#7a7570` on `#1a1a26`: **3.78:1** -- FAILS for text under 18pt
- Most usages of `--text-dim` are at 11-13px, well below the 18pt/14pt-bold threshold for large text.
- **Fix:** Increase `--text-dim` to at least `#8a8580` on darker backgrounds, or ensure this color is only used on the lightest background.

### 2.2 `--gold-dim` (#8a6f3e) Marginal Contrast
- **WCAG:** 1.4.3 Contrast (Minimum) (Level AA)
- **Severity:** Major
- **Element:** `.panel-wiki-link`, wiki section headings, search box focus border (line 167, 458, 842)
- **Description:** `#8a6f3e` on `#0a0a0f` achieves **4.16:1**, which fails the 4.5:1 requirement for normal-sized text. Used at 12px for wiki links and 14px for section headings.
- **Fix:** Increase to `#a0813e` or similar for interactive text elements.

### 2.3 No Focus Indicators Beyond Browser Defaults
- **WCAG:** 2.4.7 Focus Visible (Level AA)
- **Severity:** Major
- **Element:** Global -- `#search-input` has `outline: none` (line 173)
- **Description:** The search input explicitly removes its outline. While `#search-box:focus-within` adds a border-color change (line 167), this is a subtle shift from `#2a2a3a` to `#8a6f3e` which may not be perceivable. Buttons (`#dim-toggle`, `#fly-toggle`, `#panel-close-btn`) rely on browser default focus rings which may be suppressed by user agents. No custom focus styles are defined for these elements.
- **Fix:** Add visible focus indicators (e.g., `outline: 2px solid var(--gold); outline-offset: 2px`) to all interactive elements. Never use `outline: none` without a replacement.

### 2.4 Heading Hierarchy Is Broken
- **WCAG:** 1.3.1 Info and Relationships (Level A)
- **Severity:** Major
- **Element:** Document heading structure
- **Description:** The page has `<h1>` ("Bodhidharma" in header) and `<h3>` ("Keyboard Shortcuts" in shortcuts panel) but skips `<h2>`. The shortcuts panel heading is `<h3>` with no preceding `<h2>`. The detail panel and wiki view generate `<h2>` headings dynamically but have no consistent hierarchy when panels are closed.
- **Fix:** Use sequential heading levels. The shortcuts panel should use `<h2>`. Ensure dynamically generated content follows the heading hierarchy.

### 2.5 Detail Panel Has No ARIA Landmark or Focus Management
- **WCAG:** 4.1.2 Name, Role, Value (Level A)
- **Severity:** Major
- **Element:** `#detail-panel` (line 1212)
- **Description:** The detail panel slides in from the right when a node is clicked but has no `role` attribute (should be `role="complementary"` or `role="dialog"`), no `aria-label`, and does not manage focus. When opened, focus stays on the graph area; screen reader users would not know a panel appeared.
- **Fix:** Add `role="complementary"` with `aria-label="Concept details"`, manage focus to the panel when it opens, and trap focus or return it when closed.

### 2.6 Wiki View Has No Focus Management
- **WCAG:** 2.4.3 Focus Order (Level A)
- **Severity:** Major
- **Element:** `#wiki-view` (line 1266)
- **Description:** When the wiki view opens (via hash change), it overlays the entire page but does not trap focus or announce itself. The "Back to Graph" button is a `<div>` (line 2607), not keyboard-accessible.
- **Fix:** Trap focus within the wiki view when active, move focus to the heading, and make the back button a real `<button>`.

### 2.7 Keyboard Shortcuts May Conflict With Assistive Technology
- **WCAG:** 2.1.4 Character Key Shortcuts (Level A, WCAG 2.1)
- **Severity:** Major
- **Element:** Keyboard handler (line 2667-2704)
- **Description:** Single-character shortcuts (`?`, `/`, `3`, `F`, `L`, `T`) are active at all times (except when focused on an input). These can conflict with screen reader browse mode keys. WCAG 2.1 requires that single-character shortcuts can be turned off or remapped.
- **Fix:** Provide a mechanism to disable single-character shortcuts, or require a modifier key (e.g., Alt+/ instead of just /).

### 2.8 Non-English Terms Lack `lang` Attributes
- **WCAG:** 3.1.2 Language of Parts (Level AA)
- **Severity:** Major
- **Element:** `.lang-value` elements displaying Sanskrit, Pali, Tibetan, Chinese text (lines 2155-2156, 2575-2576)
- **Description:** The multilingual terms in the detail panel and wiki view display Sanskrit, Pali, Tibetan, and Chinese text but are only marked with `class="notranslate"` -- they have no `lang` attribute. Screen readers would attempt to pronounce these using English phoneme rules.
- **Fix:** Add appropriate `lang` attributes: `lang="sa"` for Sanskrit, `lang="pi"` for Pali, `lang="bo"` for Tibetan, `lang="zh"` for Chinese.

### 2.9 Shortcuts Panel Is Not a Proper Dialog
- **WCAG:** 4.1.2 Name, Role, Value (Level A)
- **Severity:** Major
- **Element:** `#shortcuts-panel` (line 1113)
- **Description:** The shortcuts panel overlays the page as a modal but has no `role="dialog"`, no `aria-modal="true"`, no `aria-label`, and no focus trap. Pressing `?` toggles it visually but screen readers are not informed.
- **Fix:** Add `role="dialog"`, `aria-modal="true"`, `aria-label="Keyboard shortcuts"`. Trap focus within the dialog when open and manage focus return on close.

---

## 3. Minor Issues (Improvements)

### 3.1 Loading Screen Lotus SVG Has No Description
- **WCAG:** 1.1.1 Non-text Content (Level A)
- **Severity:** Minor
- **Element:** SVG in `#loading-lotus` (line 1103-1108)
- **Description:** The decorative lotus SVG has no `aria-hidden="true"` or `role="img"` with `aria-label`. If decorative, it should be hidden; if meaningful, it needs a label.
- **Fix:** Add `aria-hidden="true"` since it is decorative.

### 3.2 Icon SVGs in Header Lack Labels
- **WCAG:** 1.1.1 Non-text Content (Level A)
- **Severity:** Minor
- **Element:** Search icon SVG (line 1135-1136), translate icon SVG (line 1142-1149)
- **Description:** The inline SVGs are decorative (adjacent to text labels) but lack `aria-hidden="true"`, so screen readers may attempt to announce them.
- **Fix:** Add `aria-hidden="true"` to decorative SVGs, or `role="img"` with `aria-label` for meaningful ones.

### 3.3 Category Chips Use Color-Only Differentiation
- **WCAG:** 1.4.1 Use of Color (Level A)
- **Severity:** Minor (partially mitigated)
- **Element:** `.chip-dot` elements (line 230-234)
- **Description:** Each category chip has a colored dot as a visual identifier. However, the chips also include text labels (e.g., "Practice", "Doctrine"), so the color dot is supplementary rather than the sole differentiator. In the graph visualization itself, nodes ARE differentiated primarily by color, which is a concern for the canvas content.
- **Fix:** The text labels mitigate this for chips. For the graph, consider adding shape variations (circle, square, triangle) by category, or patterns within nodes.

### 3.4 No Skip Navigation Link
- **WCAG:** 2.4.1 Bypass Blocks (Level A)
- **Severity:** Minor
- **Element:** Document-level (no skip link present)
- **Description:** There is no skip navigation link to bypass the header and filter bar to reach the main content area.
- **Fix:** Add a visually-hidden skip link at the top of the page that jumps to the graph area or main content.

### 3.5 Search Results Dropdown Not Announced
- **WCAG:** 4.1.3 Status Messages (Level AA, WCAG 2.1)
- **Severity:** Minor
- **Element:** `#search-results` (line 1139)
- **Description:** When search results appear, they are not announced to screen readers. The container has no `role="listbox"`, no `aria-live`, and results are not linked to the input via `aria-controls` or `aria-activedescendant`.
- **Fix:** Add `role="listbox"` to `#search-results`, `role="option"` on each result item, `aria-controls="search-results"` on the input, and `aria-expanded` to indicate dropdown state.

### 3.6 Legend Toggle Not Keyboard-Accessible
- **WCAG:** 2.1.1 Keyboard (Level A)
- **Severity:** Minor
- **Element:** `#legend-toggle` (line 1238-1241)
- **Description:** The legend toggle is a `<div>` with a click handler (line 1743). No `tabindex`, no `role`, no keyboard activation.
- **Fix:** Add `role="button"`, `tabindex="0"`, `aria-expanded`, and keyboard handlers.

### 3.7 Thread Crumb Names Are Non-Focusable Spans
- **WCAG:** 2.1.1 Keyboard (Level A)
- **Severity:** Minor
- **Element:** `.thread-crumb-name` elements (generated dynamically)
- **Description:** Thread breadcrumb names are clickable `<span>` elements without keyboard access.
- **Fix:** Use `<button>` elements or add `role="button"` with `tabindex="0"`.

### 3.8 `overflow: hidden` on Body Prevents Zoom Access
- **WCAG:** 1.4.10 Reflow (Level AA, WCAG 2.1)
- **Severity:** Minor
- **Element:** `html, body { overflow: hidden; }` (line 110-116)
- **Description:** The page uses `overflow: hidden` on both html and body, preventing scrolling. At 200% zoom, some UI elements (particularly the header controls, stats bar text) may be clipped or overlapping.
- **Fix:** Consider allowing overflow in at least one dimension, or provide a responsive layout that adapts to zoom levels.

---

## 4. Positive Findings

### 4.1 `lang="en"` Is Set on HTML Element
The document correctly sets `lang="en"` on the `<html>` element (line 2), satisfying WCAG 3.1.1.

### 4.2 Proper `<button>` Elements for Some Controls
The 2D/3D toggle (`#dim-toggle`), Fly Mode (`#fly-toggle`), panel close (`#panel-close-btn`), and thread clear (`#thread-clear-btn`) correctly use `<button>` elements, making them natively keyboard-focusable.

### 4.3 Good Primary Text Contrast
The main text color `--text` (#d4cfc4) on `--bg` (#0a0a0f) achieves a **12.72:1** contrast ratio, and `--gold` (#c9a96e) on `--bg` achieves **8.83:1** -- both excellent.

### 4.4 Page Title Is Descriptive
The `<title>` element ("Bodhidharma -- Buddhist Philosophy Knowledge Graph") is descriptive and meaningful.

### 4.5 Search Has `focus-within` Styling
The search box container changes border color when the input is focused (line 167), providing some visual feedback.

### 4.6 Keyboard Shortcuts Are Documented
The shortcuts panel (accessible via `?` key) documents all keyboard shortcuts, which is helpful for keyboard users who can access it.

### 4.7 Google Translate Integration
The page integrates Google Translate for multilingual access, which can help users who need content in their native language.

---

## Summary Table

| Category | Critical | Major | Minor |
|----------|----------|-------|-------|
| Perceivable | 2 | 3 | 3 |
| Operable | 5 | 3 | 3 |
| Understandable | 0 | 1 | 0 |
| Robust | 0 | 2 | 1 |
| **Total** | **7** | **9** | **7** |

---

## Priority Recommendations

1. **Immediate:** Add `aria-label` to the search input, fix `--text-muted` contrast, add visible focus indicators
2. **Short-term:** Make all interactive elements (chips, tabs, translate button, connections, wiki links) keyboard-accessible with proper ARIA roles
3. **Medium-term:** Provide an accessible alternative to the canvas graph (e.g., a searchable table view, or structured list of concepts)
4. **Long-term:** Add `lang` attributes to multilingual content, implement proper dialog patterns for overlay panels, add skip navigation

---

*Audit conducted against WCAG 2.1 Level AA criteria. Contrast ratios calculated using the WCAG relative luminance algorithm.*
