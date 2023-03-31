import { Operation } from "./Operation";

export class GhStackSubmitOperation extends Operation {
  static opName = "ghstack submit";

  constructor(private options?: { draft?: boolean; updateMessage?: string }) {
    super("GhStackSubmitOperation");
  }

  getArgs() {
    const args = ["ghstack", "submit"];
    if (this.options?.draft) {
      args.push("--draft");
    }
    if (this.options?.updateMessage) {
      args.push("--message", this.options?.updateMessage);
    }
    return args;
  }
}
