export interface SidebarThreadGroup {
  id: string;
  name: string;
  createdAt: string;
}

export interface SidebarThreadGroupState {
  groups: readonly SidebarThreadGroup[];
  threadGroupByThreadKey: Readonly<Record<string, string>>;
}

export interface SidebarThreadGroupSection<T> {
  id: string | null;
  name: string;
  isDefault: boolean;
  threads: T[];
}

export const EMPTY_SIDEBAR_THREAD_GROUP_STATE: SidebarThreadGroupState = Object.freeze({
  groups: Object.freeze([]),
  threadGroupByThreadKey: Object.freeze({}),
});

export function normalizeSidebarThreadGroupName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 80);
}

export function buildSidebarThreadGroupSections<T>(
  threads: readonly T[],
  groupState: SidebarThreadGroupState,
  getThreadKey: (thread: T) => string,
): SidebarThreadGroupSection<T>[] {
  if (groupState.groups.length === 0) {
    return [
      {
        id: null,
        name: "Threads",
        isDefault: true,
        threads: [...threads],
      },
    ];
  }

  const validGroupIds = new Set(groupState.groups.map((group) => group.id));
  const defaultThreads: T[] = [];
  const threadsByGroupId = new Map(groupState.groups.map((group) => [group.id, [] as T[]]));

  for (const thread of threads) {
    const groupId = groupState.threadGroupByThreadKey[getThreadKey(thread)];
    if (!groupId || !validGroupIds.has(groupId)) {
      defaultThreads.push(thread);
      continue;
    }
    threadsByGroupId.get(groupId)!.push(thread);
  }

  const sections: SidebarThreadGroupSection<T>[] = [];
  if (defaultThreads.length > 0) {
    sections.push({
      id: null,
      name: "Threads",
      isDefault: true,
      threads: defaultThreads,
    });
  }

  for (const group of groupState.groups) {
    sections.push({
      id: group.id,
      name: group.name,
      isDefault: false,
      threads: threadsByGroupId.get(group.id) ?? [],
    });
  }

  return sections;
}

export function orderThreadsBySidebarGroups<T>(
  threads: readonly T[],
  groupState: SidebarThreadGroupState,
  getThreadKey: (thread: T) => string,
): T[] {
  return buildSidebarThreadGroupSections(threads, groupState, getThreadKey).flatMap(
    (section) => section.threads,
  );
}
