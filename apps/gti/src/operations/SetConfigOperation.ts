import { Operation } from "./Operation";

export class SetConfigOperation extends Operation {
  constructor(
    private scope: "user" | "local" | "global",
    private configName: string,
    private value: string
  ) {
    super();
  }

  static opName = "Add";

  getArgs() {
    return ["config", `--${this.scope}`, this.configName, this.value];
  }
}
