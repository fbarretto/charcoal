import { Operation } from "./Operation";

export class PullOperation extends Operation {
  static opName = "Pull";

  constructor() {
    super("PullOperation");
  }

  getArgs() {
    return ["internal-only", "pulltrunk"];
  }
}
