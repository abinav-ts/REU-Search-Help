# 06 — Frontend (GitHub Pages)

Depends on: 00, 03, 04, 05. Code: `docs/`. No framework, no build step.

## Screens (one page, sections shown/hidden by state)

**State machine:** `idle → resolving → (choosing)? → extracting → done`, with `error` reachable from any state and "Try again" returning to `idle` while keeping the query.

1. **Header + profile bar:** title, one-line promise, "Your profile" summary chip (opens the form drawer), "Clear my data".
2. **Search box:** one input ("Programme name, link, or what you remember about it") + button. Optional collapsed "Preferences" (tier, country) — labels only in v1.
3. **Progress panel (while running):** list of `stage` messages as they arrive, newest highlighted; elapsed timer; "Cancel".
4. **Disambiguation:** up to 3 cards (name, organisation, cycle hint, why it matched, official domain); pick one → continues. For `single`, show the "Is this the one? Not this one →" chip above the result.
5. **Result page** (order matters):
   1. Title block: programme, organisation, tier + country labels, cycle year, deadline with `open/closed/upcoming` chip, stale-cycle warning.
   2. **Verdict banner** (Eligible / Unclear / Not eligible), the one-line summary, and the deciding quote with its source link. Expandable "How this was decided" listing every check.
   3. **At-a-glance grid:** problem statement; shared fields with you; SOPs; recommendation letters; other documents; duration; stipend; mode/location; fee.
   4. **Mentors** list (name, affiliation, area, link).
   5. **Not stated on the site** — collapsed list of `not_found` fields, grey.
   6. **Sources:** pages read (ok/failed), fetch time, "from cache" note, "Verify on the official site" button (H6).
6. **Error panel:** friendly message per code in 05 §6, with the right next action (e.g. `js_required`/`blocked` → paste-text box; `no_program_found` → type the full name or paste a link; `quota_exhausted` → "free limit reached, the cached example lookups still work" with the example chips highlighted).
7. **Paste-text box** (collapsed, appears on `js_required`/`blocked`).
8. **CV control** in the profile drawer (P1) with the privacy line from R-CV-5.

## Requirements
- **R-UI-1** Every displayed fact shows a small "source" link to `source_url` and a status marker: ✓ stated, ⚠ ambiguous (tooltip shows the conflicting quotes), grey "Not stated on the site".
- **R-UI-2** `evidence_verified === false` fields render as ambiguous with the note "Quote could not be matched on the page".
- **R-UI-3** The verdict is computed in the browser by `eligibility.js` and re-computed when the profile changes.
- **R-UI-4** Text from the Worker is inserted with `textContent` (never `innerHTML`) to avoid script injection. Links get `rel="noopener noreferrer"` and open in a new tab; only `https:` URLs are rendered as links.
- **R-UI-5** Works at 360 px width with a 16 px gutter; no horizontal scroll; keyboard-operable; sufficient contrast; respects `prefers-color-scheme`.
- **R-UI-6** The demo key prompt appears once if missing (stored in `sessionStorage`, try/catch).
- **R-UI-7** The SSE reader handles disconnects: shows "Connection lost — try again", never hangs on the progress panel.
- **R-UI-8** Provide an "Example lookups" row of 4-5 clickable chips (the demo set) for quick, reliable demos.
- **R-UI-9** Design: calm, readable, information-dense; the verdict banner is the visual anchor. No stock-template look; no animation that delays reading.

## Acceptance
| ID | Check |
|---|---|
| U1 | Full flow works on desktop Chrome and on an Android phone |
| U2 | Progress messages appear within 3 s of pressing search and update as pages are read |
| U3 | Picking from the disambiguation cards continues without retyping |
| U4 | Each of the 13 error codes in spec 05 §6 renders a distinct, actionable message |
| U5 | A `not_found` field never shows a value or an empty source link |
| U6 | Changing citizenship in the profile flips the verdict without a new lookup |
| U7 | A fixture record containing `<script>alert(1)</script>` in a field renders as text |
| U8 | Page is usable with JavaScript localStorage disabled |
