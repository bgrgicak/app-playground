import { resolve } from 'path';
import { homedir } from 'os';
import { logger, LogLevel } from './utils/logger.js';

export interface CliOptions {
  dataDir: string;
  startPort: number;
  maxInstances: number;
  verbose: boolean;
}

/**
 * Parse command line arguments
 */
export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    dataDir: resolve(homedir(), '.playground-mcp'),
    startPort: 9401,
    maxInstances: 10,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--data-dir' && args[i + 1]) {
      options.dataDir = resolve(args[++i]);
    } else if (arg.startsWith('--data-dir=')) {
      options.dataDir = resolve(arg.split('=')[1]);
    }

    if (arg === '--start-port' && args[i + 1]) {
      options.startPort = parseInt(args[++i], 10);
    } else if (arg.startsWith('--start-port=')) {
      options.startPort = parseInt(arg.split('=')[1], 10);
    }

    if (arg === '--max-instances' && args[i + 1]) {
      options.maxInstances = parseInt(args[++i], 10);
    } else if (arg.startsWith('--max-instances=')) {
      options.maxInstances = parseInt(arg.split('=')[1], 10);
    }

    if (arg === '-v' || arg === '--verbose') {
      options.verbose = true;
    }

    if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--version') {
      console.log('playground-mcp v0.1.0');
      process.exit(0);
    }
  }

  if (options.verbose) {
    logger.setLevel(LogLevel.DEBUG);
  }

  return options;
}

function printHelp(): void {
  console.log(`
playground-mcp - MCP server for WordPress Playground orchestration

USAGE:
  playground-mcp [OPTIONS]

OPTIONS:
  --data-dir=<path>       Directory for storing instance data
                          Default: ~/.playground-mcp

  --start-port=<port>     Starting port for Playground instances
                          Default: 9401

  --max-instances=<n>     Maximum number of concurrent instances
                          Default: 10

  -v, --verbose           Enable verbose logging

  -h, --help              Show this help message

  --version               Show version

EXAMPLES:
  # Run with default settings
  playground-mcp

  # Run with custom data directory
  playground-mcp --data-dir=/tmp/playground-data

  # Run with verbose logging
  playground-mcp --verbose

MCP CLIENT CONFIGURATION:
  Add this to your MCP client config (e.g., Claude Desktop):

  {
    "mcpServers": {
      "playground": {
        "command": "npx",
        "args": ["playground-mcp"]
      }
    }
  }
`);
}
