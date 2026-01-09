#!/usr/bin/env node

import { parseArgs } from '../src/cli.js';
import { runStdioServer } from '../src/server.js';

const options = parseArgs(process.argv.slice(2));

runStdioServer({
  dataDir: options.dataDir,
  startPort: options.startPort,
  maxInstances: options.maxInstances,
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
