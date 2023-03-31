import { Operation } from "./Operation";

export class PrSubmitOperation extends Operation {
  static opName = "pr submit";

  constructor(private options?: { draft?: boolean; updateMessage?: string }) {
    super("PrSubmitOperation");
  }

  getArgs() {
    const args = ["pr", "submit"];
    if (this.options?.draft) {
      args.push("--draft");
    }
    if (this.options?.updateMessage) {
      args.push("--message", this.options?.updateMessage);
    }
    return args;
  }
}
