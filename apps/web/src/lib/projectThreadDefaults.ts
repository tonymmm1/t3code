import {
  DEFAULT_PROJECT_THREAD_DEFAULTS,
  type ProjectThreadDefaults,
} from "@t3tools/contracts/settings";
import { buildTemporaryWorktreeBranchName, sanitizeBranchFragment } from "@t3tools/shared/git";

export function normalizeProjectThreadDefaults(
  defaults: Partial<ProjectThreadDefaults> | null | undefined,
): ProjectThreadDefaults {
  const copyPaths = [...new Set((defaults?.copyPaths ?? []).map((path) => path.trim()))].filter(
    (path) => path.length > 0,
  );

  return {
    prompt: defaults?.prompt?.trim() ?? DEFAULT_PROJECT_THREAD_DEFAULTS.prompt,
    worktreeBaseDirectory:
      defaults?.worktreeBaseDirectory?.trim() ??
      DEFAULT_PROJECT_THREAD_DEFAULTS.worktreeBaseDirectory,
    branchPrefix: defaults?.branchPrefix?.trim() ?? DEFAULT_PROJECT_THREAD_DEFAULTS.branchPrefix,
    copyPaths,
  };
}

export function isProjectThreadDefaultsEmpty(defaults: ProjectThreadDefaults): boolean {
  return (
    defaults.prompt.length === 0 &&
    defaults.worktreeBaseDirectory.length === 0 &&
    defaults.branchPrefix.length === 0 &&
    defaults.copyPaths.length === 0
  );
}

export function parseProjectCopyPathsText(value: string): readonly string[] {
  return [...new Set(value.split(/\r?\n/g).map((path) => path.trim()))].filter(
    (path) => path.length > 0,
  );
}

export function formatProjectCopyPathsText(paths: readonly string[]): string {
  return parseProjectCopyPathsText(paths.join("\n")).join("\n");
}

export function selectProjectThreadDefaults(
  defaultsByProjectKey: Readonly<Record<string, ProjectThreadDefaults>>,
  projectKey: string,
): ProjectThreadDefaults {
  return normalizeProjectThreadDefaults(defaultsByProjectKey[projectKey]);
}

export function composePromptWithProjectDefault(input: {
  readonly defaultPrompt: string;
  readonly prompt: string;
}): string {
  const defaultPrompt = input.defaultPrompt.trim();
  const prompt = input.prompt.trim();
  if (defaultPrompt.length === 0) {
    return prompt;
  }
  if (prompt.length === 0) {
    return defaultPrompt;
  }
  return `${defaultPrompt}\n\n${prompt}`;
}

export function composeFirstTurnPromptWithProjectDefault(input: {
  readonly defaultPrompt: string;
  readonly isFirstMessage: boolean;
  readonly prompt: string;
}): string {
  if (!input.isFirstMessage) {
    return input.prompt;
  }
  return composePromptWithProjectDefault(input);
}

function normalizeBranchPrefix(prefix: string): string | null {
  if (prefix.trim().length === 0) {
    return null;
  }
  return sanitizeBranchFragment(prefix);
}

function sanitizeWorktreeFolderName(branchName: string): string {
  let lastSegment = branchName;
  for (const segment of branchName.split("/")) {
    if (segment.length > 0) {
      lastSegment = segment;
    }
  }
  return sanitizeBranchFragment(lastSegment).replace(/\//g, "-");
}

export function buildProjectWorktreeBranchName(input: {
  readonly defaults: ProjectThreadDefaults;
  readonly titleSeed: string;
  readonly randomHex: (byteLength: number) => string;
}): string {
  const branchPrefix = normalizeBranchPrefix(input.defaults.branchPrefix);
  if (!branchPrefix) {
    return buildTemporaryWorktreeBranchName(input.randomHex);
  }

  const topic = sanitizeBranchFragment(input.titleSeed || "thread");
  const token = input.randomHex(3).toLowerCase();
  return `${branchPrefix}/${topic}-${token}`;
}

export function buildProjectWorktreePath(input: {
  readonly defaults: ProjectThreadDefaults;
  readonly branchName: string;
}): string | null {
  const baseDirectory = input.defaults.worktreeBaseDirectory.trim().replace(/\/+$/g, "");
  if (baseDirectory.length === 0) {
    return null;
  }
  return `${baseDirectory}/${sanitizeWorktreeFolderName(input.branchName)}`;
}
