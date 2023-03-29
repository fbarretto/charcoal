

const {injectAdditionalPlatforms} = require('./customBuildEntry');
const rewire = require('rewire');
const defaults = rewire('react-scripts/scripts/start.js');
const configFactory = defaults.__get__('configFactory');

defaults.__set__('configFactory', env => {
  const config = configFactory(env);
  config.experiments = {
    asyncWebAssembly: true,
  };
  config.output.library = 'EdenSmartlog';

  // don't open broser when running `yarn start`,
  // since we need to use `yarn serve --dev` from gti-server
  process.env.BROWSER = 'none';

  injectAdditionalPlatforms(config);

  // ts-loader is required to reference external typescript projects/files (non-transpiled)
  config.module.rules.push({
    test: /\.tsx?$/,
    loader: 'ts-loader',
    exclude: /node_modules/,
    options: {
      transpileOnly: true,
      configFile: 'tsconfig.json',
    },
  });

  return config;
});
