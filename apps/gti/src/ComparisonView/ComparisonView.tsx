import type { Result } from "../types";
import {
  Comparison,
  comparisonIsAgainstHead,
} from "@withgraphite/gti-shared/Comparison";
import type { LineRangeParams } from "@withgraphite/gti-shared/SplitDiffView/types";
import type { ParsedDiff } from "@withgraphite/gti-shared/patch/parse";

import serverAPI from "../ClientToServerAPI";
import { EmptyState } from "../EmptyState";
import { ErrorNotice } from "../ErrorNotice";
import { Tooltip } from "../Tooltip";
import platform from "../platform";
import { latestHeadCommit } from "../serverAPIState";
import { themeState } from "../theme";
import { currentComparisonMode } from "./atoms";
import { ThemeProvider, BaseStyles } from "@primer/react";
import {
  VSCodeButton,
  VSCodeDropdown,
  VSCodeOption,
} from "@vscode/webview-ui-toolkit/react";
import { useCallback, useEffect } from "react";
import {
  labelForComparison,
  ComparisonType,
} from "@withgraphite/gti-shared/Comparison";
import { Icon } from "@withgraphite/gti-shared/Icon";
import { SplitDiffView } from "@withgraphite/gti-shared/SplitDiffView";
import SplitDiffViewPrimerStyles from "@withgraphite/gti-shared/SplitDiffView/PrimerStyles";
import { parsePatch } from "@withgraphite/gti-shared/patch/parse";

import "./ComparisonView.scss";
import { family } from "../lib/mobx-recoil/family";
import { observableBoxWithInitializers } from "../lib/mobx-recoil/observable_box_with_init";
import { computed, runInAction } from "mobx";
import stringify from "fast-json-stable-stringify";
import { observer } from "mobx-react-lite";
import { fromPromise } from "mobx-utils";

/**
 * Transform Result<T> to Result<U> by applying `fn` on result.value.
 * If the result is an error, just return it unchanged.
 */
function mapResult<T, U>(result: Result<T>, fn: (t: T) => U): Result<U> {
  return result.error == null ? { value: fn(result.value) } : result;
}

function parsePatchAndFilter(patch: string): ReturnType<typeof parsePatch> {
  const result = parsePatch(patch);
  return result.filter(
    // empty patches and other weird situations can cause invalid files to get parsed, ignore these entirely
    (diff) =>
      diff.hunks.length > 0 ||
      diff.newFileName != null ||
      diff.oldFileName != null
  );
}

const currentComparisonData = family({
  genKey: (comparison: Comparison) => {
    if (comparison.type === ComparisonType.Committed) {
      return `Committed-${comparison.hash}`;
    }

    switch (comparison.type) {
      case ComparisonType.HeadChanges:
        return "HEAD";
      case ComparisonType.StackChanges:
        return "STACK";
      case ComparisonType.UncommittedChanges:
        return "UNCOMMITTED";
    }
  },
  genValue: (comparison: Comparison) => {
    return observableBoxWithInitializers<{
      isLoading: boolean;
      data: Result<Array<ParsedDiff>> | null;
    }>({
      default: { isLoading: true, data: null },
      setter: (value) => {
        if (value.isLoading) {
          serverAPI.postMessage({ type: "requestComparison", comparison });
        }
      },
      effects: [
        ({ setSelf }) => {
          const disposable = serverAPI.onMessageOfType(
            "comparison",
            (event) => {
              if (comparison.type === event.comparison.type) {
                setSelf({
                  isLoading: false,
                  data: mapResult(event.data.diff, parsePatchAndFilter),
                });
              }
            }
          );
          return () => disposable.dispose();
        },
      ],
    });
  },
});

export const lineRange = family({
  genKey: (
    params: LineRangeParams<{ path: string; comparison: Comparison }>
  ) => {
    return stringify(params);
  },
  genValue: (
    params: LineRangeParams<{ path: string; comparison: Comparison }>
  ) => {
    return computed(() => {
      // We must ensure this lineRange gets invalidated when the underlying file's context lines
      // have changed.
      // This depends on the comparison:
      // for Committed: the commit hash is included in the Comparison, thus the cached data will always be accurate.
      // for Uncommitted, Head, and Stack:
      // by referencing the latest head commit atom, we ensure this selector reloads when the head commit changes.
      // These comparisons are all against the working copy (not exactly head),
      // but there's no change that could be made that would affect the context lines without
      // also changing the head commit's hash.
      // Note: we use latestHeadCommit WITHOUT previews, so we don't accidentally cache the file content
      // AGAIN on the same data while waiting for some new operation to finish.
      latestHeadCommit.get();

      serverAPI.postMessage({
        type: "requestComparisonContextLines",
        ...params,
      });

      const promise = new Promise<Array<string>>((res) => {
        const disposable = serverAPI.onMessageOfType(
          "comparisonContextLines",
          (event) => {
            res(event.lines);
            disposable.dispose();
          }
        );
      });

      return fromPromise(promise);
    });
  },
});

function useComparisonData(comparison: Comparison) {
  const currentComparison = currentComparisonData(comparison);
  const compared = currentComparison.get();
  const reloadComparison = useCallback(() => {
    runInAction(() => {
      const data = currentComparison.get();
      // setting comparisonData's isLoading: true triggers a fetch
      currentComparison.set({ ...data, isLoading: true });
    });
  }, [currentComparison]);
  return [compared, reloadComparison] as const;
}

const ComparisonView = observer(
  ({ comparison }: { comparison: Comparison }) => {
    const [compared, reloadComparison] = useComparisonData(comparison);

    // any time the comparison changes, fetch the diff
    useEffect(reloadComparison, [comparison, reloadComparison]);

    const theme = themeState.get();

    return (
      <div data-testid="comparison-view" className="comparison-view">
        <ThemeProvider colorMode={theme === "light" ? "day" : "night"}>
          <SplitDiffViewPrimerStyles />
          <BaseStyles className="comparison-view-base-styles">
            <ComparisonViewHeader comparison={comparison} />
            <div className="comparison-view-details">
              {compared.data == null ? (
                <Icon icon="loading" />
              ) : compared.data.error != null ? (
                <ErrorNotice
                  error={compared.data.error}
                  title={"Unable to load comparison"}
                />
              ) : compared.data.value.length === 0 ? (
                <EmptyState>No Changes</EmptyState>
              ) : (
                compared.data.value.map((parsed, i) => (
                  <ComparisonViewFile
                    diff={parsed}
                    comparison={comparison}
                    key={i}
                  />
                ))
              )}
            </div>
          </BaseStyles>
        </ThemeProvider>
      </div>
    );
  }
);

export default ComparisonView;

const defaultComparisons = [
  ComparisonType.UncommittedChanges as const,
  ComparisonType.HeadChanges as const,
  ComparisonType.StackChanges as const,
];
const ComparisonViewHeader = observer(
  ({ comparison }: { comparison: Comparison }) => {
    const [compared, reloadComparison] = useComparisonData(comparison);

    return (
      <>
        <div className="comparison-view-header">
          <span className="comparison-view-header-group">
            <VSCodeDropdown
              data-testid="comparison-view-picker"
              value={comparison.type}
              onChange={(event) => {
                const previous = currentComparisonMode.get();
                currentComparisonMode.set({
                  ...previous,
                  comparison: {
                    type: (event as React.FormEvent<HTMLSelectElement>)
                      .currentTarget.value as (typeof defaultComparisons)[0],
                  },
                });
              }}
            >
              {defaultComparisons.map((comparison) => (
                <VSCodeOption value={comparison} key={comparison}>
                  {labelForComparison({ type: comparison })}
                </VSCodeOption>
              ))}
              {!defaultComparisons.includes(
                comparison.type as (typeof defaultComparisons)[0]
              ) ? (
                <VSCodeOption value={comparison.type} key={comparison.type}>
                  {labelForComparison(comparison)}
                </VSCodeOption>
              ) : null}
            </VSCodeDropdown>
            <Tooltip
              delayMs={1000}
              title={
                "Reload this comparison. Comparisons do not refresh automatically."
              }
            >
              <VSCodeButton appearance="secondary" onClick={reloadComparison}>
                <Icon icon="refresh" data-testid="comparison-refresh-button" />
              </VSCodeButton>
            </Tooltip>
            {compared.isLoading ? (
              <Icon icon="loading" data-testid="comparison-loading" />
            ) : null}
          </span>
          <VSCodeButton
            data-testid="close-comparison-view-button"
            appearance="icon"
            onClick={() =>
              runInAction(() => {
                const previous = currentComparisonMode.get();
                currentComparisonMode.set({
                  ...previous,
                  visible: false,
                });
              })
            }
          >
            <Icon icon="x" />
          </VSCodeButton>
        </div>
      </>
    );
  }
);

function ComparisonViewFile({
  diff,
  comparison,
}: {
  diff: ParsedDiff;
  comparison: Comparison;
}) {
  const path = diff.newFileName ?? diff.oldFileName ?? "";
  const context = {
    id: { path, comparison },
    atoms: { lineRange },
    copy: platform.clipboardCopy,
    // only offer clickable line numbers for comparisons against head, otherwise line numbers will be inaccurate
    openFileToLine: comparisonIsAgainstHead(comparison)
      ? (line: number) => platform.openFile(path, { line })
      : undefined,
  };
  return (
    <div className="comparison-view-file" key={path}>
      <SplitDiffView ctx={context} patch={diff} path={path} />
    </div>
  );
}
