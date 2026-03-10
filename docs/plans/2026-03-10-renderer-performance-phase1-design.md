# Renderer Performance Phase 1 Design

## Goal

Improve Cherry Studio's renderer responsiveness across chat scrolling, timeline jumps, tab switching, sidebar/history navigation, startup feel, and background CPU usage without introducing chat virtualization in this phase.

## Constraints

- Typical chat size is small to medium, roughly 20 to 100 messages per topic.
- Open conversation tabs should stay warm by default for near-instant switching.
- Tabs may be cooled only under genuine memory pressure.
- Hardware acceleration should stay enabled by default.
- This pass should prioritize real improvements over upstream-safety.
- Random timeline jumps inside each topic must remain reliable.

## Non-Goals

- No full chat virtualization in phase 1.
- No Redux data-model or IndexedDB schema changes.
- No redesign of conversation UX.
- No promise of unlimited large-topic support in this phase.

## Current Observations

The renderer hot path is dominated by the active chat process rather than background helpers.

Observed in the current development session:

- total Electron and preview process tree is roughly 2.1 GiB RSS
- active renderer is roughly 1.14 GiB RSS
- inactive conversation tabs are intentionally kept mounted in `src/renderer/src/pages/home/Chat.tsx`
- chat and timeline features rely on DOM-based locate and scroll semantics

The repo already has useful building blocks:

- route lazy loading
- idle scheduling helpers
- dynamic and draggable virtual list components
- worker-backed services for Shiki and Pyodide
- `startTransition` and `useDeferredValue` used in some list surfaces

## Design Summary

Phase 1 will optimize the full performance stack without introducing a virtualized chat mode:

- renderer and layout work reduction
- worker offload for heavy pure-compute tasks
- compositor and GPU-friendly surface cleanup
- explicit warm and cold conversation-tab lifecycle
- pressure-based tab cooling policy
- first-class performance instrumentation

## Architecture

### 1. Measurement First

Add lightweight renderer performance instrumentation in development builds.

Metrics to collect:

- tab switch latency
- timeline jump latency
- long tasks
- scroll frame-drop signals
- renderer memory snapshots
- background task queue pressure

The goal is to validate hot paths before and after each optimization slice.

### 2. Warm Tab Lifecycle

Retain conversation tabs by default, but distinguish between:

- `active`: visible and interactive
- `warm`: mounted with preserved state, but background work suspended
- `cold`: unmounted or heavily suspended under pressure, with state retained for restoration

Cooling policy:

- begin cooling cold inactive tabs below 10 percent available RAM
- stop cooling and allow warming again only after recovery above 15 percent available RAM
- keep the active tab exempt

Warm tabs should preserve:

- topic identity
- scroll position
- active timeline anchor
- content search state where possible
- cached derived data used for fast reactivation

Warm tabs should stop:

- timeline remeasurement
- token estimation
- inactive search rescans
- flow-history recomputation
- non-essential animation work

### 3. Chat Render Stabilization

Keep the chat pane DOM-rendered for phase 1, but reduce work in the hot path.

Primary directions:

- narrow selectors so unrelated state changes do not fan out into chat trees
- cache grouped, reversed, and timeline-derived message structures behind stable inputs
- remove unnecessary remount triggers
- move secondary work off the interactive path with transitions and idle scheduling
- ensure inactive mounted tabs stay render-dormant

### 4. Timeline and Jump Optimization

Preserve the existing DOM-based jump semantics, but make them cheaper.

Primary directions:

- precompute anchor metadata from message inputs
- separate logical anchor indexing from DOM measurement
- schedule remeasurement more selectively
- reduce repeated container and node lookups
- keep direct indexed jumps and locate-message behavior aligned with the same anchor model

### 5. Large List Virtualization

Apply or strengthen virtualization on large list surfaces before touching the main chat body.

Targets include:

- history pages
- search-result lists
- topic and session side surfaces that still pay large render costs
- any large auxiliary list in the home workspace shell

### 6. CPU Parallelism

Use workers for heavy pure-compute tasks, not for layout and DOM work.

Good candidates:

- search filtering and ranking
- flow-history graph preparation
- token and summary estimation
- cache warming and background indexing
- heavier text-processing transforms

Concurrency policy:

- focused app: conservative worker concurrency
- idle or unfocused app: higher background concurrency
- never consume all available cores

On a 16-core machine, the app should still leave headroom for other workloads.

### 7. GPU and Compositor Efficiency

Keep hardware acceleration enabled and clean up hot surfaces so the compositor can help where appropriate.

Primary directions:

- reduce blur and filter usage on switching and scrolling surfaces
- prefer transform and opacity transitions
- use `contain` and `content-visibility` selectively where safe
- avoid blanket `will-change`
- ensure inactive warm panels are not triggering paint-heavy effects

GPU optimization is treated as a complement to reducing JS, layout, and paint work, not a substitute.

## Data Flow

### Active Conversation

1. chat shell resolves the active panel
2. active panel becomes interactive
3. active-only secondary work is scheduled
4. timeline and search operate only on active-panel DOM

### Warm Inactive Conversation

1. panel remains retained
2. preserved state is kept locally or in dedicated caches
3. panel suppresses background recalculation and measurement work
4. reactivation uses retained state instead of rebuilding from scratch

### Cold Conversation

1. state snapshot and derived caches are retained
2. DOM tree may be unmounted or deeply suspended
3. reactivation restores state before resuming active-only work

## Error Handling and Safety

- Cooling logic must never unload the active conversation.
- Missing measurements or stale performance samples should fail open, not break rendering.
- Worker failures must fall back to main-thread behavior where necessary.
- If a surface cannot be safely virtualized or suspended without breaking jump semantics, keep the current path and log it as deferred.
- Feature-gate dev instrumentation so it does not add user-visible overhead in production.

## Testing Strategy

### Automated

- unit tests for lifecycle and cooling decisions
- focused renderer tests for active versus inactive panel behavior
- tests for timeline anchor derivation and jump timing hooks
- tests for worker-scheduler backpressure and fallback behavior
- tests for list virtualization integration where behavior changed

### Manual

- tab switching across multiple open topics
- random timeline jumps in active topics
- scrolling active chats while other tabs remain open
- startup and navigation feel
- behavior under artificial memory pressure or forced cooling

## Rollout

Phase 1 should be implemented in slices:

1. instrumentation and lifecycle scaffolding
2. inactive-tab dormancy and chat render stabilization
3. timeline optimization
4. list-surface virtualization
5. worker-based compute offload
6. compositor and GPU-surface cleanup

Each slice should be validated independently so performance gains are attributable and regressions are localized.
