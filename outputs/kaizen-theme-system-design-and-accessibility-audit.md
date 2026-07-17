# Kaizen Theme System Design and Accessibility Audit

## Direction
Kaizen Light preserves the recognizable white, neutral, and deep-green product identity. Kaizen Dark uses premium charcoal application backgrounds, deep slate-green elevated surfaces, restrained green accents, warm off-white text, subtle borders, and controlled elevation. Both themes share layout, typography, spacing, interaction, and semantic meaning.

## Token architecture
The client uses three layers: primitive palette values, semantic theme tokens, and workflow-specific canvas tokens. `data-theme="light|dark"` selects resolved tokens. Compatibility aliases preserve the existing light theme while legacy hard-coded styles are progressively superseded.

Core semantic roles cover application and canvas backgrounds, surfaces, text hierarchy, borders, brand controls, focus, state families, shadows, and overlays. Workflow roles cover node surfaces, selections, ports, canvas grid, minimap, edges, and edge-label surfaces.

## Accessibility findings and treatment
- Existing muted `#99A09C` on white measured 2.67:1 and was unsuitable for functional text; semantic muted colors now target AA combinations.
- Brand `#1D6B50` on white measured 6.42:1 and remains the Kaizen Light anchor.
- Proposed dark primary, secondary, muted, and brand combinations measure 16.53:1, 9.37:1, 6.09:1, and 7.99:1 on their intended surfaces.
- Functional workflow text previously reached 7–10px. Node titles are now 14px, while dense functional metadata and badges use an 11px minimum.
- Interactive elements receive a consistent two-pixel `:focus-visible` ring with offset.
- Disabled controls use explicit surface, border, foreground, and cursor treatment rather than opacity alone.
- Supported, Build Ready, Needs Clarification, Platform Limited, unresolved, warning, and error states use distinct foreground/surface/border families and retain text or icon labels.
- Existing reduced-motion support is preserved and strengthened.

WCAG 2.2 AA remains the target: 4.5:1 normal text, 3:1 large text, and 3:1 meaningful non-text controls and focus indicators.

## Theme behavior
The preference is `light`, `dark`, or `system` and is stored locally under `awm.themePreference`. Explicit choices override the operating system. System mode follows `prefers-color-scheme` and updates when that preference changes. A small pre-render bootstrap resolves the theme before React starts to limit incorrect-theme flashing.

## Canvas and export
React Flow now receives the resolved color mode and tokenized grid, minimap, node, port, edge, control, overlay, and label colors. Semantic edge labels retain opaque readable surfaces. Export capture temporarily applies a deterministic Kaizen Light export class, then removes it, preventing the active viewport theme from changing exported content.

## Component risks
The legacy stylesheet contains many hard-coded values. The theme layer intentionally overrides user-visible surfaces while preserving layout; future component work should use semantic tokens directly. External application logos may still require asset-by-asset review. Browser-native select, scrollbar, autofill, forced-colors, and OS-specific rendering need ongoing cross-browser QA.

## Implementation boundaries
Client-only changes cover theme controller, selector, startup initialization, token stylesheet, React Flow theme wiring, export isolation, and focused tests. No planner, compiler, Stage C/D, prompt, SDK behavior, server, database, or persistence contract changes are included.
