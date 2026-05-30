import { useEffect, useMemo, useState } from "react";
import type { ProjectThreadDefaults } from "@t3tools/contracts/settings";

import {
  formatProjectCopyPathsText,
  isProjectThreadDefaultsEmpty,
  normalizeProjectThreadDefaults,
  parseProjectCopyPathsText,
} from "../lib/projectThreadDefaults";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

interface ProjectThreadDefaultsDialogProps {
  readonly open: boolean;
  readonly projectName: string;
  readonly defaults: ProjectThreadDefaults;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSave: (defaults: ProjectThreadDefaults) => void;
}

export function ProjectThreadDefaultsDialog(props: ProjectThreadDefaultsDialogProps) {
  const normalizedDefaults = useMemo(
    () => normalizeProjectThreadDefaults(props.defaults),
    [props.defaults],
  );
  const [prompt, setPrompt] = useState(normalizedDefaults.prompt);
  const [worktreeBaseDirectory, setWorktreeBaseDirectory] = useState(
    normalizedDefaults.worktreeBaseDirectory,
  );
  const [branchPrefix, setBranchPrefix] = useState(normalizedDefaults.branchPrefix);
  const [copyPathsText, setCopyPathsText] = useState(
    formatProjectCopyPathsText(normalizedDefaults.copyPaths),
  );

  useEffect(() => {
    if (!props.open) {
      return;
    }
    setPrompt(normalizedDefaults.prompt);
    setWorktreeBaseDirectory(normalizedDefaults.worktreeBaseDirectory);
    setBranchPrefix(normalizedDefaults.branchPrefix);
    setCopyPathsText(formatProjectCopyPathsText(normalizedDefaults.copyPaths));
  }, [normalizedDefaults, props.open]);

  const draftDefaults = normalizeProjectThreadDefaults({
    prompt,
    worktreeBaseDirectory,
    branchPrefix,
    copyPaths: parseProjectCopyPathsText(copyPathsText),
  });
  const hasDefaults = !isProjectThreadDefaultsEmpty(normalizedDefaults);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Thread defaults</DialogTitle>
          <DialogDescription>{props.projectName}</DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            id="project-thread-defaults-form"
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              props.onSave(draftDefaults);
              props.onOpenChange(false);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="project-thread-default-prompt">Default prompt</Label>
              <Textarea
                id="project-thread-default-prompt"
                className="min-h-32"
                placeholder="Read AGENTS.md first."
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="project-thread-default-worktree-base">Worktree directory</Label>
                <Input
                  id="project-thread-default-worktree-base"
                  placeholder="~/git/HappyDog/grafeauction-worktrees"
                  value={worktreeBaseDirectory}
                  onChange={(event) => setWorktreeBaseDirectory(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="project-thread-default-branch-prefix">Branch prefix</Label>
                <Input
                  id="project-thread-default-branch-prefix"
                  placeholder="feature/go-backend"
                  value={branchPrefix}
                  onChange={(event) => setBranchPrefix(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-thread-default-copy-paths">Copy paths</Label>
              <Textarea
                id="project-thread-default-copy-paths"
                className="min-h-24 font-mono text-xs"
                placeholder={".codex\nAGENTS.md"}
                value={copyPathsText}
                onChange={(event) => setCopyPathsText(event.target.value)}
              />
            </div>
          </form>
        </DialogPanel>
        <DialogFooter>
          {hasDefaults ? (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto"
              onClick={() => {
                props.onSave(normalizeProjectThreadDefaults({}));
                props.onOpenChange(false);
              }}
            >
              Clear
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="project-thread-defaults-form">
            Save
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
