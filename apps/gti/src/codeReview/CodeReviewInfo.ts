import type { DiffSummary, PageVisibility, Result } from "../types";
import type { UICodeReviewProvider } from "./UICodeReviewProvider";

import serverAPI from "../ClientToServerAPI";
import { repositoryInfo } from "../serverAPIState";
import { GithubUICodeReviewProvider } from "./github/github";
import { debounce } from "@withgraphite/gti-shared/debounce";
import { observableBoxWithInitializers } from "../lib/mobx-recoil/observable_box_with_init";
import { computed } from "mobx";
import { family } from "../lib/mobx-recoil/family";
import type { PRNumber } from "@withgraphite/gti-cli-shared-types";

export const codeReviewProvider = computed<UICodeReviewProvider | null>(() => {
  const repoInfo = repositoryInfo.get();
  if (repoInfo?.type !== "success") {
    return null;
  }
  if (repoInfo.codeReviewSystem.type === "github") {
    return new GithubUICodeReviewProvider(repoInfo.codeReviewSystem);
  }

  return null;
});

export const diffSummary = family({
  genKey: (diffId: PRNumber | undefined) => diffId || "__UNDEFINED__",
  genValue: (diffId: PRNumber | undefined) => {
    return computed(() => {
      const all = allDiffSummaries.get();
      if (all == null) {
        return { value: undefined };
      }
      if (all.error) {
        return { error: all.error };
      }
      if (diffId == null) {
        return { value: undefined };
      }
      return { value: all.value?.get(diffId) };
    });
  },
});

export const allDiffSummaries = observableBoxWithInitializers<
  Result<Map<PRNumber, DiffSummary> | null>
>({
  default: { value: null },
  effects: [
    ({ setSelf }) => {
      const disposable = serverAPI.onMessageOfType(
        "fetchedDiffSummaries",
        (event) => {
          setSelf(event.summaries);
        }
      );
      return () => disposable.dispose();
    },
    () =>
      serverAPI.onSetup(() =>
        serverAPI.postMessage({
          type: "fetchDiffSummaries",
        })
      ),
  ],
});

export const pageVisibility = observableBoxWithInitializers<PageVisibility>({
  default: document.hasFocus() ? "focused" : document.visibilityState,
  setter: debounce((state) => {
    serverAPI.postMessage({
      type: "pageVisibility",
      state,
    });
  }, 50),
  effects: [
    ({ setSelf }) => {
      const handleVisibilityChange = () => {
        setSelf(document.hasFocus() ? "focused" : document.visibilityState);
      };

      window.addEventListener("focus", handleVisibilityChange);
      window.addEventListener("blur", handleVisibilityChange);
      document.addEventListener("visibilitychange", handleVisibilityChange);
      return () => {
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange
        );
        window.removeEventListener("focus", handleVisibilityChange);
        window.removeEventListener("blur", handleVisibilityChange);
      };
    },
  ],
});
