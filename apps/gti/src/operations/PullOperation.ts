import { Operation } from "./Operation";

export class PullOperation extends Operation {
  static opName = "Pull";

  getArgs() {
    return ["interactive", "pulltrunk"];
  }
}
