import { Operation } from "./Operation";

export class CreateEmptyInitialCommitOperation extends Operation {
  static opName = "CreateEmptyInitialCommit";

  constructor() {
    super("CreateEmptyInitialCommit");
  }

  getArgs() {
    return ["internal-only", "init"];
  }
}
