import { Operation } from "./Operation";

export class PrSubmitOperation extends Operation {
  static opName = "pr submit";

  constructor(private branch: string, private options?: { draft?: boolean }) {
    super("PrSubmitOperation");
  }

  getArgs() {
    const args = ["pr", "submit", "--branch", this.branch];
    if (this.options?.draft) {
      args.push("--draft");
    }
    return args;
  }
}
