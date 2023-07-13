import { Operation } from "./Operation";

export class PullOperation extends Operation {
  static opName = "Pull";

  constructor(private options: { restack: boolean; deleteBranches: boolean }) {
    super("PullOperation");
  }

  getArgs() {
    return [
      "repo",
      "sync",
      this.options.deleteBranches ? "-f" : "--no-delete",
      ...(this.options.restack ? ["-r"] : []),
    ];
  }
}
