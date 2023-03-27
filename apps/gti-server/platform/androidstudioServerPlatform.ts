

import type {ServerPlatform} from '../src/serverPlatform';

export const platform: ServerPlatform = {
  platformName: 'androidStudio',
  handleMessageFromClient: async (_repo, message, _postMessage) => {
    switch (message.type) {
      // TODO: handle any android-studio platform file events
      case 'platform/openFile': {
        break;
      }
    }
  },
};
