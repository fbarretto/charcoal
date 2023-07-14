import type { FieldConfig } from "@withgraphite/gti-shared";

export function emptyCommitMessageFields(): CommitMessageFields {
  return {
    title: "",
    description: "",
  };
}

/**
 * Construct value representing all fields are false: {title: false, description: false, ...}
 */
export function noFieldsBeingEdited(): FieldsBeingEdited {
  return Object.fromEntries(
    Object.keys(CommitFieldSchema).map((key) => [key, false])
  ) as FieldsBeingEdited;
}

/**
 * Construct value representing all fields are being edited: {title: true, description: true, ...}
 */
export function allFieldsBeingEdited(): FieldsBeingEdited {
  return Object.fromEntries(
    Object.keys(CommitFieldSchema).map((key) => [key, true])
  ) as FieldsBeingEdited;
}

/**
 * Construct value representing which fields differ between two parsed messages, by comparing each field.
 * ```
 * findFieldsBeingEdited({title: 'hi', description: 'yo'}, {title: 'hey', description: 'yo'}) -> {title: true, description: false}
 * ```
 */
export function findFieldsBeingEdited(
  a: CommitMessageFields,
  b: CommitMessageFields
): FieldsBeingEdited {
  return Object.fromEntries(
    Object.entries(CommitFieldSchema).map(([key, config]) => [
      key,
      (config as FieldConfig).type === "field"
        ? !arraysEqual(
            a[
              key as keyof typeof CommitFieldSchema
            ] as unknown as Array<string>,
            b[key as keyof typeof CommitFieldSchema] as unknown as Array<string>
          )
        : a[key as keyof typeof CommitFieldSchema] !==
          b[key as keyof typeof CommitFieldSchema],
    ])
  ) as FieldsBeingEdited;
}

export const CommitFieldSchema = {
  title: { label: "Title", type: "title", icon: "milestone" },
  description: { label: "Description", type: "textarea", icon: "note" },
} satisfies Record<string, FieldConfig>;

export type CommitMessageFields = Record<
  keyof typeof CommitFieldSchema,
  string
>;

export type FieldsBeingEdited = Record<
  keyof typeof CommitFieldSchema,
  boolean
> & {
  forceWhileOnHead?: boolean;
};

function arraysEqual<T>(a: Array<T>, b: Array<T>): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((val, i) => b[i] === val);
}
