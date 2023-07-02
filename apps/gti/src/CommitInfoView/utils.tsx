import type { BranchInfo } from "@withgraphite/gti-cli-shared-types";
import type {
  CommitMessageFields,
  FieldConfig,
  FieldsBeingEdited,
} from "./types";
import type { ReactNode } from "react";

import { YouAreHere } from "../Commit";
import { InlineBadge } from "../InlineBadge";
import { Subtle } from "../Subtle";
import { Tooltip } from "../Tooltip";
import { RelativeDate } from "../relativeDate";

export function CommitTitleByline({ commit }: { commit: BranchInfo }) {
  const createdByInfo = (
    // TODO: determine if you're the author to say "you"
    <>Created by {commit.author}</>
  );
  return (
    <Subtle className="commit-info-title-byline">
      {commit.isHead ? <YouAreHere hideSpinner /> : null}
      {commit.partOfTrunk ? <PublicCommitBadge /> : null}
      <OverflowEllipsis shrink>
        <Tooltip trigger="hover" component={() => createdByInfo}>
          {createdByInfo}
        </Tooltip>
      </OverflowEllipsis>
      <OverflowEllipsis>
        <Tooltip trigger="hover" title={commit.date.toLocaleString()}>
          <RelativeDate date={new Date(commit.date)} />
        </Tooltip>
      </OverflowEllipsis>
    </Subtle>
  );
}

function PublicCommitBadge() {
  return (
    <Tooltip
      placement="bottom"
      title={
        "This commit has already been pushed to an append-only remote branch and can't be modified locally."
      }
    >
      <InlineBadge>
        <>Public</>
      </InlineBadge>
    </Tooltip>
  );
}

export function OverflowEllipsis({
  children,
  shrink,
}: {
  children: ReactNode;
  shrink?: boolean;
}) {
  return (
    <div className={`overflow-ellipsis${shrink ? " overflow-shrink" : ""}`}>
      {children}
    </div>
  );
}

export function SmallCapsTitle({ children }: { children: ReactNode }) {
  return <div className="commit-info-small-title">{children}</div>;
}

export function Section({
  children,
  className,
  ...rest
}: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>) {
  return (
    <section
      {...rest}
      className={"commit-info-section" + (className ? " " + className : "")}
    >
      {children}
    </section>
  );
}

export function getTopmostEditedField(
  fields: Array<FieldConfig>,
  fieldsBeingEdited: FieldsBeingEdited
): keyof CommitMessageFields | undefined {
  for (const field of fields) {
    if (fieldsBeingEdited[field.key]) {
      return field.key;
    }
  }
  return undefined;
}

/**
 * VSCodeTextArea elements use custom components, which renders in a shadow DOM.
 * Most often, we want to access the inner <textarea>, which acts like a normal textarea.
 */
export function getInnerTextareaForVSCodeTextArea(
  outer: HTMLElement | null
): HTMLTextAreaElement | null {
  return outer == null
    ? null
    : (outer as unknown as { control: HTMLTextAreaElement }).control;
}
