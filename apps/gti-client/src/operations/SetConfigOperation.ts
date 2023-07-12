import { Operation } from "./Operation";

export class SetConfigOperation extends Operation {
  constructor(
    private scope: "user",
    private configName: string,
    private value: string
  ) {
    super("SetConfigOperation");
  }

  static opName = "SetConfig";

  getArgs() {
    return [
      "internal-only",
      "set-config",
      `--level`,
      this.scope,
      this.configName,
      this.value,
    ];
  }
}
