import { describe, expect, it } from "vitest";

import {
  buildProjectWorktreeBranchName,
  buildProjectWorktreePath,
  composePromptWithProjectDefault,
  formatProjectCopyPathsText,
  normalizeProjectThreadDefaults,
  parseProjectCopyPathsText,
} from "./projectThreadDefaults";

describe("projectThreadDefaults", () => {
  it("deduplicates and trims copy paths", () => {
    expect(parseProjectCopyPathsText(" .codex \nAGENTS.md\n.codex\n\n")).toEqual([
      ".codex",
      "AGENTS.md",
    ]);
    expect(formatProjectCopyPathsText([" .codex ", "AGENTS.md", ".codex"])).toBe(
      ".codex\nAGENTS.md",
    );
  });

  it("builds branch names from the configured prefix and title", () => {
    const branch = buildProjectWorktreeBranchName({
      defaults: normalizeProjectThreadDefaults({
        branchPrefix: " feature/go-backend/ ",
      }),
      titleSeed: "Implement Thread Defaults!",
      randomHex: () => "a1b2c3",
    });

    expect(branch).toBe("feature/go-backend/implement-thread-defaults-a1b2c3");
  });

  it("falls back to temporary worktree branch names without a prefix", () => {
    const branch = buildProjectWorktreeBranchName({
      defaults: normalizeProjectThreadDefaults({}),
      titleSeed: "Implement Thread Defaults!",
      randomHex: () => "deadbeef",
    });

    expect(branch).toBe("t3code/deadbeef");
  });

  it("uses the branch leaf as the worktree folder name", () => {
    expect(
      buildProjectWorktreePath({
        defaults: normalizeProjectThreadDefaults({
          worktreeBaseDirectory: "~/git/HappyDog/grafeauction-worktrees/",
        }),
        branchName: "feature/go-backend/implement-thread-defaults-a1b2c3",
      }),
    ).toBe("~/git/HappyDog/grafeauction-worktrees/implement-thread-defaults-a1b2c3");
  });

  it("prepends default prompts without hiding the user prompt", () => {
    expect(
      composePromptWithProjectDefault({
        defaultPrompt: "Read AGENTS.md first.",
        prompt: "Implement the toolbar.",
      }),
    ).toBe("Read AGENTS.md first.\n\nImplement the toolbar.");
  });
});
