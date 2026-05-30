import { create } from "zustand";
import type { ThreadPrSortInfo } from "./lib/threadSort";

function prSortInfoEqual(left: ThreadPrSortInfo | undefined, right: ThreadPrSortInfo): boolean {
  return (
    left?.kind === right.kind &&
    left?.state === right.state &&
    left?.isDraft === right.isDraft &&
    left?.reviewDecision === right.reviewDecision
  );
}

interface SidebarThreadPrStatusStore {
  prSortInfoByThreadKey: ReadonlyMap<string, ThreadPrSortInfo>;
  setThreadPrSortInfo: (threadKey: string, info: ThreadPrSortInfo) => void;
  syncThreadPrSortInfoKeys: (threadKeys: Iterable<string>) => void;
  reset: () => void;
}

export const useSidebarThreadPrStatusStore = create<SidebarThreadPrStatusStore>((set) => ({
  prSortInfoByThreadKey: new Map(),
  setThreadPrSortInfo: (threadKey, info) =>
    set((state) => {
      if (prSortInfoEqual(state.prSortInfoByThreadKey.get(threadKey), info)) {
        return state;
      }
      const next = new Map(state.prSortInfoByThreadKey);
      next.set(threadKey, info);
      return { prSortInfoByThreadKey: next };
    }),
  syncThreadPrSortInfoKeys: (threadKeys) =>
    set((state) => {
      const retained = new Set(threadKeys);
      let changed = false;
      const next = new Map<string, ThreadPrSortInfo>();
      for (const [threadKey, info] of state.prSortInfoByThreadKey) {
        if (!retained.has(threadKey)) {
          changed = true;
          continue;
        }
        next.set(threadKey, info);
      }
      return changed ? { prSortInfoByThreadKey: next } : state;
    }),
  reset: () => set({ prSortInfoByThreadKey: new Map() }),
}));
