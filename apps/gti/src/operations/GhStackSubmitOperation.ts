import { Operation } from "./Operation";

export class GhStackSubmitOperation extends Operation {
  static opName = "ghstack submit";

  getArgs() {
    return ["ghstack", "submit"];
  }
}
