import { Operation } from "./Operation";

export class DownstackGetOperation extends Operation {
  static opName = "DownstackGet";

  constructor(private branchName: string) {
    super("DownstackGetOperation");
  }

  getArgs() {
    return ["downstack", "get", this.branchName];
  }
}
