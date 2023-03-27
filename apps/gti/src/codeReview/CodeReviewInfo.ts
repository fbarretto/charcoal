import type { DiffId, DiffSummary, PageVisibility, Result } from "../types";
import type { UICodeReviewProvider } from "./UICodeReviewProvider";

import serverAPI from "../ClientToServerAPI";
import { repositoryInfo } from "../serverAPIState";
import { GithubUICodeReviewProvider } from "./github/github";
import { debounce } from "@withgraphite/gti-shared/debounce";
import { observableBoxWithInitializers } from "../lib/mobx-recoil/observable_box_with_init";
import { computed } from "mobx";
import { family } from "../lib/mobx-recoil/family";

export const codeReviewProvider = computed<UICodeReviewProvider | null>(() => {
  const repoInfo = repositoryInfo.get();
  if (repoInfo?.type !== "success") {
    return null;
  }
  if (repoInfo.codeReviewSystem.type === "github") {
    return new GithubUICodeReviewProvider(
      repoInfo.codeReviewSystem,
      repoInfo.preferredSubmitCommand ?? "pr"
    );
  }

  return null;
});

export const diffSummary = family({
  genKey: (diffId: DiffId) => diffId,
  genValue: (diffId: DiffId) => {
    return computed(() => {
      const all = allDiffSummaries.get();
      if (all == null) {
        return { value: undefined };
      }
      if (all.error) {
        return { error: all.error };
      }
      return { value: all.value?.get(diffId) };
    });
  },
});

export const allDiffSummaries = observableBoxWithInitializers<
  Result<Map<DiffId, DiffSummary> | null>
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
      serverAPI.onConnectOrReconnect(() =>
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
