import { Operation } from "./Operation";

export class DownstackSubmitOperation extends Operation {
  static opName = "downstack submit";

  constructor(private branch: string, private options?: { draft?: boolean }) {
    super("DownstackSubmitOperation");
  }

  getArgs() {
    const args = ["downstack", "submit", "--branch", this.branch];
    if (this.options?.draft) {
      args.push("--draft");
    }
    return args;
  }
}
