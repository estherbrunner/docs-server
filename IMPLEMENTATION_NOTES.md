# Implementation Notes

Issues, decisions, and workarounds encountered during development.

## 1. Lazy `watched` callback not activating reliably with `deriveCollection` + `match()` chains

**Date:** Phase 2 (Dev Server + HMR)

**Context:** `createFileList()` creates a `List<FileInfo>` with a `watched` callback that starts `fs.watch()`. This list feeds into a `deriveCollection()` chain, ultimately consumed by a `createEffect()` that writes HTML files to disk.

**What happened:** After starting the dev server, editing a `.md` file did not trigger a rebuild. The `fs.watch()` callback never fired because the watcher was never started.

**Root cause analysis:**

The `watched` callback on a `List` activates lazily — only when a downstream sink (effect) first subscribes by reading the list. The problem is that our effect's subscription to the source list is **conditional on an async Task resolving first**.

The signal graph looks like this:

```
createEffect(() => {
  match([layoutTask], {       // ← effect first evaluates this
    ok: ([layoutHtml]) => {
      for (const signal of pageDataCollection) {  // ← reads mdFiles (indirectly)
        signal.get()
      }
    },
    nil: () => { },           // ← taken on first run (layoutTask pending)
    err: (errors) => { ... },
  })
})
```

On the effect's **first execution**:

1. Effect calls `match([layoutTask], ...)` which reads `layoutTask.get()`
2. `layoutTask` is a `Task` — it's still pending (async file read hasn't resolved)
3. `match` takes the `nil` branch (no-op)
4. The `ok` branch, which reads from `pageDataCollection` → `mdFiles`, **never executes**
5. The effect only tracks `layoutTask` as a dependency, not `mdFiles`
6. Therefore `mdFiles` has no downstream sinks
7. Therefore the `watched` callback on `mdFiles` never activates
8. Therefore `fs.watch()` never starts

When `layoutTask` eventually resolves, the effect re-runs and enters the `ok` branch, which reads `pageDataCollection`/`mdFiles`. At this point, the `watched` callback *should* activate. However, there appears to be a timing issue — either the activation happens too late, or there's a subtle issue with how `deriveCollection` propagates sink subscriptions back to the source list.

**How we tried to resolve it:**

1. **First attempt:** Used the `watched` option on `createList()` as documented. This is the idiomatic approach from Cause & Effect's API. Result: watcher never started, file changes not detected.

2. **Investigation:** Wrote a standalone `fs.watch` test confirming that `fs.watch` itself works correctly on macOS with `recursive: true` and that `Glob.match()` correctly matches the filenames returned by the watcher. This ruled out platform-level issues.

3. **Diagnosis:** Traced the subscription chain and identified the conditional read pattern (via `match` nil/ok branching) as the cause of delayed or missing sink registration on the source list.

4. **Second attempt:** Moved the `pageDataCollection` read *before* the `match()` call so it is captured synchronously on the first effect run, regardless of whether `layoutTask` is pending:

    ```typescript
    createEffect(() => {
      // Eagerly read pageDataCollection BEFORE match — registers as dependency
      const pages: PageData[] = []
      for (const signal of pageDataCollection) {
        pages.push(signal.get())
      }

      match([layoutTask], {
        ok: ([layoutHtml]) => {
          // Use pre-read pages here
        },
        nil: () => { },
        err: (errors) => { ... },
      })
    })
    ```

    Result: the effect now tracks `pageDataCollection` on every run, but the `watched` callback on the *upstream* `mdFiles` list **still never activates**. This reveals a deeper issue: `deriveCollection` does not propagate sink subscriptions back to its source list's `watched` lifecycle. Even though the derived collection has a downstream subscriber (the effect), the source list (`mdFiles`) does not see this as a sink for its `watched` callback.

    **Note from Cause & Effect maintainer:** The sync dependency tracking context is released after the first `await` boundary. `deriveCollection`'s internal Task nodes may cross async boundaries, which could prevent the subscription from propagating back to the source list's `watched` lifecycle. An alternative pattern — `match([layoutTask, pageDataCollection], { ok: ([layout, pages]) => ... })` — would capture both synchronously, but this was not tested.

**What eventually worked:**

Started the `fs.watch` eagerly (unconditionally at `createFileList` call time) instead of using the lazy `watched` callback:

```typescript
const fileList = createList<FileInfo>(initialFiles, {
  keyConfig: item => item.path,
  // No `watched` callback — watcher started eagerly below
})

if (watchEnabled) {
  const watcher = watch(directory, { recursive: true }, async (_event, filename) => {
    // ... handle file changes
  })
}
```

This ensures the watcher is always running in dev mode, regardless of when downstream effects subscribe. The `WatchedFileList` interface exposes a `closeWatcher()` method for cleanup on disposal.

**Trade-off:** We lose the lazy lifecycle management that `watched` provides (automatic cleanup when no sinks are connected). The watcher runs for the entire lifetime of the dev server, which is acceptable since `docs-server dev` is a long-running process anyway. Cleanup happens via `pipeline.dispose()` on SIGINT.

**Recommendation for Cause & Effect maintainers:**

Two issues were identified:

1. The `watched` callback's lazy activation model is incompatible with conditional read patterns (e.g., a `Task` inside `match()`). On the first effect execution, if the `Task` is still pending, the branch that reads the source list is never entered, so the source list never sees a sink, and `watched` never fires. **Workaround:** read the list eagerly before `match()`.

2. Even with eager reads, `deriveCollection` does not appear to propagate sink subscriptions to the source list's `watched` lifecycle. An effect subscribing to a derived collection does not activate `watched` on the upstream source list. **No workaround found** — requires eager watcher.

Possible solutions to consider:
- Document these interaction patterns as known caveats
- Consider an option for eager activation of `watched` (e.g., `{ watched: fn, eager: true }`)
- Consider whether `deriveCollection` should propagate sink registration back to its source list's `watched` lifecycle
