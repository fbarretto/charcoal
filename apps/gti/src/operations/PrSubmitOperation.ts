import { Operation } from "./Operation";

export class PrSubmitOperation extends Operation {
  static opName = "pr submit";

  getArgs() {
    return ["pr", "submit"];
  }
}
