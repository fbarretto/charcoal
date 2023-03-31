import { commitMessageTemplate, latestCommitTreeMap } from "./serverAPIState";
import type { BranchName } from "@withgraphite/gti-cli-shared-types";
import { family } from "./lib/mobx-recoil/family";
import { computed, observable } from "mobx";

export type EditedMessage = { title: string; description: string };

/**
 * Which fields of the message should display as editors instead of rendered values.
 * This can be controlled outside of the commit info view, but it gets updated in an effect as well when commits are changed.
 * `forceWhileOnHead` can be used to prevent auto-updating when in amend mode to bypass this effect.
 * This value is removed whenever the next real update to the value is given.
 */
export type FieldsBeingEdited = {
  title: boolean;
  description: boolean;
  forceWhileOnHead?: boolean;
};

export type CommitInfoMode = "commit" | "amend";
export type EditedMessageUnlessOptimistic =
  | (EditedMessage & { type?: undefined })
  | { type: "optimistic"; title?: undefined; description?: undefined };

/**
 * Throw if the edited message is of optimistic type.
 * We expect:
 *  - editedCommitMessage('head') should never be optimistic
 *  - editedCommitMessage(hashForCommitInTheTree) should not be optimistic
 *  - editedCommitMessage(hashForCommitNotInTheTree) should be optimistic
 */
export function assertNonOptimistic(
  editedMessage: EditedMessageUnlessOptimistic
): EditedMessage {
  if (editedMessage.type === "optimistic") {
    throw new Error("Expected edited message to not be for optimistic commit");
  }
  return editedMessage;
}

/**
 * Map of hash -> latest edited commit message, representing any changes made to the commit's message fields.
 * This also stores the state of new commit messages being written, keyed by "head" instead of a commit hash.
 * Even though messages are not edited by default, we can compute an initial state from the commit's original message,
 * which allows this state to be non-nullable which is very convenient. This shouldn't do any actual storage until it is written to.
 * Note: this state should be cleared when amending / committing / meta-editing.
 *
 * Note: since commits are looked up without optimistic state, its possible that we fail to look up the commit.
 * This would mean its a commit that only exists due to previews/optimitisc state,
 * for example the fake commit optimistically inserted as the new head while `commit` is running.
 * In such a state, we don't know the commit message we should use in the editor, nor do we have
 * a hash we could associate it with. For simplicity, the UI should prevent you from editing such commits' messages.
 * (TODO: hypothetically, we could track commit succession to take your partially edited message and persist it
 * once optimistic state resolves, but it would be complicated for not much benefit.)
 * We return a sentinel value without an edited message attached so the UI knows it cannot edit.
 * This optimistic value is never returned in commit mode.
 */
const editedCommitMessagesDefaults = family({
  genKey: (hash: BranchName | "head") => hash,
  genValue: (hash: BranchName | "head") => {
    return computed<EditedMessageUnlessOptimistic>(() => {
      if (hash === "head") {
        const templates = commitMessageTemplate.get();
        const templateEntries = templates ? Object.entries(templates) : [];
        return templateEntries.length === 1
          ? {
              title: "",
              description: templateEntries[0][1],
            }
          : {
              title: "",
              description: "",
            };
      }
      // TODO: is there a better way we should derive `isOptimistic`
      // from `get(treeWithPreviews)`, rather than using non-previewed map?
      const map = latestCommitTreeMap.get();
      const info = map.get(hash)?.info;
      if (info == null) {
        return { type: "optimistic" as const };
      }
      return { title: info.title, description: info.description };
    });
  },
});
export const editedCommitMessages = family({
  genKey: (hash: BranchName | "head") => hash,
  genValue: (hash: BranchName | "head") => {
    const def = editedCommitMessagesDefaults(hash).get();
    return observable.box<EditedMessageUnlessOptimistic>(def);
  },
});

export const hasUnsavedEditedCommitMessage = family({
  genKey: (hash: BranchName | "head") => hash,
  genValue: (hash: BranchName | "head") => {
    return computed(() => {
      const edited = editedCommitMessages(hash).get();
      if (edited.type === "optimistic") {
        return false;
      }
      if (hash === "head") {
        return Boolean(edited.title || edited.description);
      }
      // TODO: use treeWithPreviews so this indicator is accurate on top of previews
      const original = latestCommitTreeMap.get().get(hash)?.info;
      return (
        edited.title !== original?.title ||
        edited.description !== original?.description
      );
    });
  },
});

export const commitFieldsBeingEdited = observable.box<FieldsBeingEdited>(
  {
    title: false,
    description: false,
  },
  { deep: false }
);

export const commitMode = observable.box<CommitInfoMode>("amend");
