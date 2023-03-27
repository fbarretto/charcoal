import { Operation } from "./Operation";

export class ContinueOperation extends Operation {
  static opName = "Continue";

  getArgs() {
    return ["continue"];
  }
}
