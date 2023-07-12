import type { Repository } from "../Repository";
import type { Logger } from "@withgraphite/gti-shared";
import type { ServerPlatform } from "../serverPlatform";
import type {
  ApplicationInfo,
  FullTrackData,
  TrackDataWithEventName,
} from "@withgraphite/gti-shared";

import { generateAnalyticsInfo } from "./environment";
import { Tracker } from "@withgraphite/gti-shared";

export type ServerSideTracker = Tracker<ServerSideContext>;

class ServerSideContext {
  constructor(public logger: Logger, public data: ApplicationInfo) {}

  public setRepo(repo: Repository | undefined): void {
    this.data.repo = repo?.codeReviewProvider?.getSummaryName();
  }
}

const noOp = (_data: FullTrackData) => {
  /* In open source builds, analytics tracking is completely disabled/removed. */
};

/**
 * Creates a Tracker which includes server-side-only cached application data like platform, username, etc,
 * and sends data to the underlying analytics engine outside of GTI.
 * This can not be global since two client connections may have different cached data.
 */
export function makeServerSideTracker(
  logger: Logger,
  platform: ServerPlatform,
  version: string,
  // prettier-ignore
  writeToServer = noOp
): ServerSideTracker {
  return new Tracker(
    (data: TrackDataWithEventName, context: ServerSideContext) => {
      const { logger } = context;
      // log track event, since tracking events can be used as datapoints when reviewing logs
      logger.log(
        "[track]",
        data.eventName,
        data.errorName ?? "",
        data.extras != null ? JSON.stringify(data.extras) : ""
      );
      writeToServer({ ...data, ...context.data });
    },
    new ServerSideContext(
      logger,
      generateAnalyticsInfo(platform.platformName, version)
    )
  );
}
