import { describe, expect, it } from "vitest";
import type { VcsStatusResult } from "@t3tools/contracts";

import { prStatusIndicator } from "./ThreadStatusIndicators";

const githubProvider: NonNullable<VcsStatusResult["sourceControlProvider"]> = {
  kind: "github",
  name: "GitHub",
  baseUrl: "https://github.com",
};

const openPullRequest: NonNullable<VcsStatusResult["pr"]> = {
  number: 42,
  title: "Ship branch status",
  url: "https://github.com/pingdotgg/t3code/pull/42",
  baseRef: "main",
  headRef: "feature/status",
  state: "open",
};

describe("prStatusIndicator", () => {
  it("renders open draft pull requests as draft instead of green open PRs", () => {
    const status = prStatusIndicator(
      {
        ...openPullRequest,
        isDraft: true,
      },
      githubProvider,
    );

    expect(status).toMatchObject({
      label: "PR draft",
      iconKind: "draft",
      colorClass: "text-zinc-500 dark:text-zinc-400/80",
      tooltip: "#42 PR draft: Ship branch status",
    });
  });

  it("keeps non-draft open pull requests green", () => {
    const status = prStatusIndicator(openPullRequest, githubProvider);

    expect(status).toMatchObject({
      label: "PR open",
      iconKind: "open",
      colorClass: "text-emerald-600 dark:text-emerald-300/90",
      tooltip: "#42 PR open: Ship branch status",
    });
  });
});
