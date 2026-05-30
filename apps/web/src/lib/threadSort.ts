import type { ProjectId } from "@t3tools/contracts";
import type { SidebarProjectSortOrder, SidebarThreadSortOrder } from "@t3tools/contracts/settings";
import type { Thread } from "../types";

export type ThreadSortInput = Pick<Thread, "createdAt" | "updatedAt"> & {
  latestUserMessageAt?: string | null;
  messages?: Pick<Thread["messages"][number], "createdAt" | "role">[];
};

export interface ThreadPrSortInfo {
  kind: "pull_request" | "non_pr" | "unknown";
  state?: "open" | "closed" | "merged";
  isDraft?: boolean;
  reviewDecision?: "approved" | "changes_requested" | "review_required" | null;
}

export interface ThreadSortOptions<T> {
  getThreadKey?: (thread: T) => string;
  prSortInfoByThreadKey?: ReadonlyMap<string, ThreadPrSortInfo>;
}

export function toSortableTimestamp(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function getFirstSortableTimestamp(...values: Array<string | null | undefined>): number | null {
  for (const value of values) {
    const timestamp = toSortableTimestamp(value ?? undefined);
    if (timestamp !== null) {
      return timestamp;
    }
  }

  return null;
}

function getLatestUserMessageTimestamp(thread: ThreadSortInput): number {
  if (thread.latestUserMessageAt) {
    return toSortableTimestamp(thread.latestUserMessageAt) ?? Number.NEGATIVE_INFINITY;
  }

  let latestUserMessageTimestamp: number | null = null;

  for (const message of thread.messages ?? []) {
    if (message.role !== "user") continue;
    const messageTimestamp = toSortableTimestamp(message.createdAt);
    if (messageTimestamp === null) continue;
    latestUserMessageTimestamp =
      latestUserMessageTimestamp === null
        ? messageTimestamp
        : Math.max(latestUserMessageTimestamp, messageTimestamp);
  }

  if (latestUserMessageTimestamp !== null) {
    return latestUserMessageTimestamp;
  }

  return getFirstSortableTimestamp(thread.updatedAt, thread.createdAt) ?? Number.NEGATIVE_INFINITY;
}

export function getThreadSortTimestamp(
  thread: ThreadSortInput,
  sortOrder: SidebarThreadSortOrder | Exclude<SidebarProjectSortOrder, "manual">,
): number {
  if (sortOrder === "created_at") {
    return (
      getFirstSortableTimestamp(thread.createdAt, thread.updatedAt) ?? Number.NEGATIVE_INFINITY
    );
  }
  return getLatestUserMessageTimestamp(thread);
}

function getThreadPrSortRank(info: ThreadPrSortInfo | null | undefined): number {
  if (!info || info.kind === "unknown") {
    return 5;
  }
  if (info.kind === "non_pr") {
    return 4;
  }
  if (info.state === "closed" || info.state === "merged") {
    return 3;
  }
  if (info.isDraft === true) {
    return 2;
  }
  if (info.reviewDecision === "approved" || info.reviewDecision === "changes_requested") {
    return 1;
  }
  return 0;
}

export function sortThreads<T extends Pick<Thread, "id"> & ThreadSortInput>(
  threads: readonly T[],
  sortOrder: SidebarThreadSortOrder,
  options: ThreadSortOptions<T> = {},
): T[] {
  return threads.toSorted((left, right) => {
    if (sortOrder === "pull_request") {
      const leftKey = options.getThreadKey?.(left);
      const rightKey = options.getThreadKey?.(right);
      const leftPrRank = getThreadPrSortRank(
        leftKey ? options.prSortInfoByThreadKey?.get(leftKey) : undefined,
      );
      const rightPrRank = getThreadPrSortRank(
        rightKey ? options.prSortInfoByThreadKey?.get(rightKey) : undefined,
      );
      if (leftPrRank !== rightPrRank) {
        return leftPrRank - rightPrRank;
      }
    }

    const rightTimestamp = getThreadSortTimestamp(right, sortOrder);
    const leftTimestamp = getThreadSortTimestamp(left, sortOrder);
    const byTimestamp =
      rightTimestamp === leftTimestamp ? 0 : rightTimestamp > leftTimestamp ? 1 : -1;
    if (byTimestamp !== 0) return byTimestamp;
    return right.id.localeCompare(left.id);
  });
}

export function getLatestThreadForProject<
  T extends Pick<Thread, "id" | "projectId" | "archivedAt"> & ThreadSortInput,
>(threads: readonly T[], projectId: ProjectId, sortOrder: SidebarThreadSortOrder): T | null {
  return (
    sortThreads(
      threads.filter((thread) => thread.projectId === projectId && thread.archivedAt === null),
      sortOrder,
    )[0] ?? null
  );
}
