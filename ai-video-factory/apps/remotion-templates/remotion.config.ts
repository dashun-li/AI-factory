import { Config } from '@remotion/cli/config';
import path from 'node:path';
import os from 'node:os';

Config.setVideoImageFormat('jpeg');
Config.setConcurrency(Math.max(1, Math.floor((os.availableCpu ? os.availableCpu() : os.cpus().length) / 2)));
Config.setChromiumOpenGlRenderer('angle');

Config.overrideWebpackConfig((config) => {
  config.resolve = config.resolve ?? {};
  config.resolve.modules = [
    ...(config.resolve.modules ?? []),
    path.resolve(__dirname, 'node_modules'),
  ];
  return config;
});
