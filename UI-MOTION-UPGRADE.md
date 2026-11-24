# BrandWeave Kinetic Gen-Z UI Upgrade

This upgrade transforms the previous restrained editorial appearance into a more expressive, high-fidelity visual system while retaining the existing product structure and app workflows.

## Visual direction
- Replaced the muted beige/olive treatment with a vibrant electric-lavender, pop-pink, aqua and acid-lime palette in both light and dark modes.
- Added Space Grotesk + DM Sans + DM Mono typography for a sharper, more contemporary product identity.
- Reworked the landing hero, capability cards, step section, dashboard hero, navigation, statistics and glass surfaces with brighter contrast, gradient lighting, bento rhythm and more depth.
- Added decorative geometric forms: orbit rings, diamonds, squares, crosses, floating labels and layered ambient colour blooms.

## Ambient motion system
- `public/ambient-motion.js` creates a full-viewport canvas particle field with connected points, subtle node glows, pulse variation and cursor-aware attraction.
- A moving dotted grid and multiple independent CSS geometry animations create depth behind both the landing page and workspace.
- Compact cards receive lightweight pointer-based 3D tilt; the effect is not applied to inputs or text controls.
- The particle count adapts to viewport size, pointer type and device hardware concurrency. The draw loop is capped at 42 FPS on fine pointers and 30 FPS on touch devices, and pauses while the tab is hidden.
- Large background elements animate with transforms; no animation library or new runtime dependency was added.

## Accessibility and performance
- The system honors `prefers-reduced-motion`; the canvas becomes a static decorative field and CSS motion is disabled.
- Touch devices use a reduced particle count and lower visual opacity.
- The previous duplicated motion-experience initializer was removed so back-to-top, keyboard help and reveal observers are not installed twice.
- Existing Firebase, authentication, API, review, approval, audit and AI workflows were not intentionally changed.

## Files added
- `public/kinetic-design.css`
- `public/ambient-motion.js`

## Verification performed
- JavaScript syntax checks passed for the app and new ambient-motion file.
- HTML parser check passed for `public/index.html`.
- PostCSS parser checks passed for the base, theme and kinetic stylesheets.
- No new npm dependencies were introduced.
