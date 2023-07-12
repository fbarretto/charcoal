import { Operation } from "./Operation";

export class StackSubmitOperation extends Operation {
  static opName = "stack submit";

  constructor(
    private branch: string,
    private options?: { draft?: boolean; updateOnly?: boolean }
  ) {
    super("StackSubmitOperation");
  }

  getArgs() {
    const args = ["stack", "submit", "--branch", this.branch];
    if (this.options?.draft) {
      args.push("--draft");
    }
    if (this.options?.updateOnly) {
      args.push("--update-only");
    }
    return args;
  }
}
