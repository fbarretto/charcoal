export type TChangedFile = {
  path: string;
  status: 'added' | 'copied' | 'deleted' | 'modified' | 'renamed';
};

export type TStatusFile = {
  path: string;
  status:
    | 'added'
    | 'copied'
    | 'deleted'
    | 'modified'
    | 'renamed'
    | 'unresolved'
    | 'untracked_added'
    | 'untracked_deleted';
};
