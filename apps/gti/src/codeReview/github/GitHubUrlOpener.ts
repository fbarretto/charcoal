import { repositoryInfo } from "../../serverAPIState";
import { computed } from "mobx";
import { family } from "../../lib/mobx-recoil/family";

/**
 * Configured pull request domain to view associated pull requests, such as reviewstack.dev.
 */
export const pullRequestDomain = computed<string | undefined>(() => {
  const info = repositoryInfo.get();
  return info?.type !== "success" ? undefined : info.pullRequestDomain;
});

export const openerUrlForDiffUrl = family({
  genKey: (url?: string) => {
    return url || "__EMPTY__";
  },
  genValue: (url?: string) => {
    return computed(() => {
      if (!url) {
        return url;
      }
      const newDomain = pullRequestDomain.get();
      if (newDomain) {
        return url.replace(
          /^https:\/\/[^/]+/,
          newDomain.startsWith("https://") ? newDomain : `https://${newDomain}`
        );
      }
      return url;
    });
  },
});
