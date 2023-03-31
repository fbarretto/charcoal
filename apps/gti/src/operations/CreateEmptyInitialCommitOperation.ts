import { Operation } from "./Operation";

export class CreateEmptyInitialCommitOperation extends Operation {
  static opName = "CreateEmptyInitialCommit";

  constructor() {
    super("CreateEmptyInitialCommit");
  }

  getArgs() {
    return [
      "commit",
      "--config",
      "ui.allowemptycommit=true",
      "--message",
      "Initial Commit",
    ];
  }
}
