import { Operation } from "./Operation";

export class SetConfigOperation extends Operation {
  constructor(
    private scope: "user" | "local" | "global",
    private configName: string,
    private value: string
  ) {
    super("SetConfigOperation");
  }

  static opName = "SetConfig";

  getArgs() {
    return ["config", `--${this.scope}`, this.configName, this.value];
  }
}
