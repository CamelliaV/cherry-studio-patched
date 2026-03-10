# Renderer Performance Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve renderer responsiveness for chat, tabs, timeline jumps, large navigation lists, and background compute pressure without introducing chat virtualization in this phase.

**Architecture:** Keep the current warm-tab UX model, but make inactive tabs dormant, instrument the renderer, reduce hot-path recomputation, virtualize large side lists, and offload heavy pure-compute work to bounded workers. Treat GPU and compositor cleanup as a complement to reducing main-thread work, not as a substitute.

**Tech Stack:** Electron, React 19, Redux Toolkit, styled-components, TanStack virtual list utilities, Vitest, Web Workers, `PerformanceObserver`.

---

### Task 1: Add renderer performance instrumentation

**Files:**
- Create: `src/renderer/src/services/perf/RendererPerfService.ts`
- Create: `src/renderer/src/services/perf/__tests__/RendererPerfService.test.ts`
- Create: `src/renderer/src/hooks/useRendererPerfMonitor.ts`
- Modify: `src/renderer/src/pages/home/HomePage.tsx`

**Step 1: Write the failing test**

Add tests that verify the performance service can:

- record named timings
- collect long-task events when available
- expose a lightweight snapshot API without crashing when browser APIs are missing

**Step 2: Run test to verify it fails**

Run: `pnpm test:renderer src/renderer/src/services/perf/__tests__/RendererPerfService.test.ts`
Expected: FAIL because the service does not exist.

**Step 3: Write minimal implementation**

Implement a dev-focused renderer performance service and a hook that starts monitoring from `HomePage` only in development builds.

**Step 4: Run test to verify it passes**

Run: `pnpm test:renderer src/renderer/src/services/perf/__tests__/RendererPerfService.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/renderer/src/services/perf/RendererPerfService.ts src/renderer/src/services/perf/__tests__/RendererPerfService.test.ts src/renderer/src/hooks/useRendererPerfMonitor.ts src/renderer/src/pages/home/HomePage.tsx
git commit -m "perf: add renderer performance instrumentation"
```

### Task 2: Introduce warm and cold conversation lifecycle control

**Files:**
- Create: `src/renderer/src/pages/home/hooks/useConversationPanelLifecycle.ts`
- Create: `src/renderer/src/pages/home/hooks/__tests__/useConversationPanelLifecycle.test.ts`
- Modify: `src/renderer/src/pages/home/Chat.tsx`

**Step 1: Write the failing test**

Add tests for panel lifecycle decisions that verify:

- the active tab is always kept active
- inactive tabs remain warm by default
- colding begins only below the 10 percent available-memory threshold
- warming resumes only after recovery above the 15 percent threshold

**Step 2: Run test to verify it fails**

Run: `pnpm test:renderer src/renderer/src/pages/home/hooks/__tests__/useConversationPanelLifecycle.test.ts`
Expected: FAIL because lifecycle policy logic does not exist.

**Step 3: Write minimal implementation**

Add a conversation-panel lifecycle hook and update `Chat.tsx` so panel state is explicit and pressure-aware, while preserving the current mounted-by-default behavior outside pressure conditions.

**Step 4: Run test to verify it passes**

Run: `pnpm test:renderer src/renderer/src/pages/home/hooks/__tests__/useConversationPanelLifecycle.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/renderer/src/pages/home/hooks/useConversationPanelLifecycle.ts src/renderer/src/pages/home/hooks/__tests__/useConversationPanelLifecycle.test.ts src/renderer/src/pages/home/Chat.tsx
git commit -m "perf: add conversation panel lifecycle control"
```

### Task 3: Make inactive conversation panels dormant

**Files:**
- Create: `src/renderer/src/pages/home/Messages/__tests__/MessagesDormancy.test.tsx`
- Modify: `src/renderer/src/pages/home/Messages/Messages.tsx`
- Modify: `src/renderer/src/pages/home/Messages/MessageAnchorLine.tsx`
- Modify: `src/renderer/src/pages/home/Messages/ChatFlowHistory.tsx`

**Step 1: Write the failing test**

Add renderer tests that verify inactive panels do not run active-only work such as:

- token estimation
- timeline hotkeys and measurement refresh
- flow-history heavy recomputation paths

**Step 2: Run test to verify it fails**

Run: `pnpm test:renderer src/renderer/src/pages/home/Messages/__tests__/MessagesDormancy.test.tsx`
Expected: FAIL because inactive panels still execute too much mounted work.

**Step 3: Write minimal implementation**

Guard active-only work in `Messages.tsx`, `MessageAnchorLine.tsx`, and `ChatFlowHistory.tsx`, and separate retained UI state from background recomputation.

**Step 4: Run test to verify it passes**

Run: `pnpm test:renderer src/renderer/src/pages/home/Messages/__tests__/MessagesDormancy.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/renderer/src/pages/home/Messages/Messages.tsx src/renderer/src/pages/home/Messages/MessageAnchorLine.tsx src/renderer/src/pages/home/Messages/ChatFlowHistory.tsx src/renderer/src/pages/home/Messages/__tests__/MessagesDormancy.test.tsx
git commit -m "perf: suspend inactive conversation work"
```

### Task 4: Extract and cache timeline and message-derived structures

**Files:**
- Create: `src/renderer/src/pages/home/Messages/messageDerivations.ts`
- Create: `src/renderer/src/pages/home/Messages/__tests__/messageDerivations.test.ts`
- Modify: `src/renderer/src/pages/home/Messages/Messages.tsx`
- Modify: `src/renderer/src/pages/home/Messages/MessageAnchorLine.tsx`

**Step 1: Write the failing test**

Add tests that verify grouped messages and timeline anchor derivations:

- return stable output for identical message input
- preserve ordering and anchor mapping
- ignore clear messages where intended

**Step 2: Run test to verify it fails**

Run: `pnpm test:renderer src/renderer/src/pages/home/Messages/__tests__/messageDerivations.test.ts`
Expected: FAIL because the derivation helper does not exist.

**Step 3: Write minimal implementation**

Extract grouped-message and timeline-anchor derivations into a shared helper module, then update `Messages.tsx` and `MessageAnchorLine.tsx` to reuse it and avoid duplicated hot-path work.

**Step 4: Run test to verify it passes**

Run: `pnpm test:renderer src/renderer/src/pages/home/Messages/__tests__/messageDerivations.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/renderer/src/pages/home/Messages/messageDerivations.ts src/renderer/src/pages/home/Messages/__tests__/messageDerivations.test.ts src/renderer/src/pages/home/Messages/Messages.tsx src/renderer/src/pages/home/Messages/MessageAnchorLine.tsx
git commit -m "perf: cache chat message derivations"
```

### Task 5: Reduce compositor-heavy work on conversation surfaces

**Files:**
- Create: `src/renderer/src/pages/home/__tests__/conversationSurfaceStyles.test.tsx`
- Modify: `src/renderer/src/pages/home/Chat.tsx`
- Modify: `src/main/services/WindowService.ts`

**Step 1: Write the failing test**

Add tests that verify hot conversation surfaces avoid expensive always-on visual effects in the default path and only enable switch-specific styling when needed.

**Step 2: Run test to verify it fails**

Run: `pnpm test:renderer src/renderer/src/pages/home/__tests__/conversationSurfaceStyles.test.tsx`
Expected: FAIL because the current styles still rely on heavier overlay effects.

**Step 3: Write minimal implementation**

Reduce or gate `backdrop-filter` and similar paint-heavy effects on conversation switching surfaces, keep transitions compositor-friendly, and review `backgroundThrottling` behavior in `WindowService.ts` for compatibility with warm-tab expectations.

**Step 4: Run test to verify it passes**

Run: `pnpm test:renderer src/renderer/src/pages/home/__tests__/conversationSurfaceStyles.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/renderer/src/pages/home/Chat.tsx src/main/services/WindowService.ts src/renderer/src/pages/home/__tests__/conversationSurfaceStyles.test.tsx
git commit -m "perf: streamline conversation surface rendering"
```

### Task 6: Virtualize history and heavy navigation lists

**Files:**
- Modify: `src/renderer/src/pages/history/components/TopicsHistory.tsx`
- Modify: `src/renderer/src/pages/history/components/SearchResults.tsx`
- Create: `src/renderer/src/pages/history/components/__tests__/HistoryVirtualization.test.tsx`

**Step 1: Write the failing test**

Add tests that verify large history and search-result datasets render through virtualized list surfaces while preserving selection and active-item behavior.

**Step 2: Run test to verify it fails**

Run: `pnpm test:renderer src/renderer/src/pages/history/components/__tests__/HistoryVirtualization.test.tsx`
Expected: FAIL because these surfaces still render full lists.

**Step 3: Write minimal implementation**

Adopt the repo's virtual list utilities for history and heavy navigation surfaces that still render full lists.

**Step 4: Run test to verify it passes**

Run: `pnpm test:renderer src/renderer/src/pages/history/components/__tests__/HistoryVirtualization.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/renderer/src/pages/history/components/TopicsHistory.tsx src/renderer/src/pages/history/components/SearchResults.tsx src/renderer/src/pages/history/components/__tests__/HistoryVirtualization.test.tsx
git commit -m "perf: virtualize history navigation lists"
```

### Task 7: Add bounded worker scheduling for heavy foreground and background compute

**Files:**
- Create: `src/renderer/src/services/perf/WorkerTaskScheduler.ts`
- Create: `src/renderer/src/services/perf/__tests__/WorkerTaskScheduler.test.ts`
- Modify: `src/renderer/src/pages/home/Messages/ChatFlowHistory.tsx`
- Modify: `src/renderer/src/services/TokenService.ts`

**Step 1: Write the failing test**

Add tests that verify a bounded scheduler:

- limits concurrent background tasks
- prioritizes foreground tasks
- exposes a safe fallback path when worker execution is unavailable

**Step 2: Run test to verify it fails**

Run: `pnpm test:renderer src/renderer/src/services/perf/__tests__/WorkerTaskScheduler.test.ts`
Expected: FAIL because the scheduler does not exist.

**Step 3: Write minimal implementation**

Add a bounded worker-task scheduler and integrate it first with the heaviest pure-compute surfaces that can safely move off the renderer hot path.

**Step 4: Run test to verify it passes**

Run: `pnpm test:renderer src/renderer/src/services/perf/__tests__/WorkerTaskScheduler.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/renderer/src/services/perf/WorkerTaskScheduler.ts src/renderer/src/services/perf/__tests__/WorkerTaskScheduler.test.ts src/renderer/src/pages/home/Messages/ChatFlowHistory.tsx src/renderer/src/services/TokenService.ts
git commit -m "perf: add bounded worker task scheduling"
```

### Task 8: Verify the combined renderer performance pass

**Files:**
- Modify: `docs/plans/2026-03-10-renderer-performance-phase1.md`

**Step 1: Run targeted test commands**

Run: `pnpm test:renderer src/renderer/src/services/perf/__tests__/RendererPerfService.test.ts src/renderer/src/pages/home/hooks/__tests__/useConversationPanelLifecycle.test.ts src/renderer/src/pages/home/Messages/__tests__/MessagesDormancy.test.tsx src/renderer/src/pages/home/Messages/__tests__/messageDerivations.test.ts src/renderer/src/pages/home/__tests__/conversationSurfaceStyles.test.tsx src/renderer/src/pages/history/components/__tests__/HistoryVirtualization.test.tsx src/renderer/src/services/perf/__tests__/WorkerTaskScheduler.test.ts`
Expected: PASS.

**Step 2: Run lightweight type validation**

Run: `pnpm typecheck`
Expected: PASS.

**Step 3: Launch the app for manual validation**

Run: `pnpm start`
Expected: the app launches so the user can validate tab switching, timeline jumps, chat scrolling, history navigation, and perceived responsiveness.

**Step 4: Commit**

```bash
git add docs/plans/2026-03-10-renderer-performance-phase1.md
git commit -m "docs: record renderer performance phase 1 plan"
```
