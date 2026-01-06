// Type declarations for @wp-playground/cli
// This file works around a module resolution issue in the @wp-playground/cli package

declare module '@wp-playground/cli' {
  import type { Server } from 'http';

  export const LogVerbosity: {
    readonly Quiet: {
      readonly name: 'quiet';
      readonly severity: {
        readonly name: 'fatal';
        readonly level: 0;
      };
    };
    readonly Normal: {
      readonly name: 'normal';
      readonly severity: {
        readonly name: 'info';
        readonly level: 4;
      };
    };
    readonly Debug: {
      readonly name: 'debug';
      readonly severity: {
        readonly name: 'debug';
        readonly level: 5;
      };
    };
  };

  type LogVerbosity = (typeof LogVerbosity)[keyof typeof LogVerbosity]['name'];

  export interface RunCLIArgs {
    blueprint?: unknown;
    command: 'server' | 'run-blueprint' | 'build-snapshot';
    debug?: boolean;
    login?: boolean;
    mount?: unknown[];
    'mount-before-install'?: unknown[];
    outfile?: string;
    php?: string;
    port?: number;
    'site-url'?: string;
    quiet?: boolean;
    verbosity?: LogVerbosity;
    wp?: string;
    autoMount?: string;
    experimentalMultiWorker?: number;
    experimentalTrace?: boolean;
    internalCookieStore?: boolean;
    'additional-blueprint-steps'?: unknown[];
    intl?: boolean;
    xdebug?: boolean | {
      ideKey?: string;
    };
    experimentalUnsafeIdeIntegration?: string[];
    experimentalDevtools?: boolean;
    'experimental-blueprints-v2-runner'?: boolean;
    wordpressInstallMode?: string;
    skipSqliteSetup?: boolean;
    followSymlinks?: boolean;
    'blueprint-may-read-adjacent-files'?: boolean;
    mode?: 'mount-only' | 'create-new-site' | 'apply-to-existing-site';
    'db-engine'?: 'sqlite' | 'mysql';
    'db-host'?: string;
    'db-user'?: string;
    'db-pass'?: string;
    'db-name'?: string;
    'db-path'?: string;
    'truncate-new-site-directory'?: boolean;
    allow?: string;
  }

  export interface RunCLIServer extends AsyncDisposable {
    playground: unknown;
    server: Server;
    serverUrl: string;
    [Symbol.asyncDispose](): Promise<void>;
  }

  export function runCLI(args: RunCLIArgs & { command: 'server' }): Promise<RunCLIServer>;
  export function runCLI(args: RunCLIArgs & { command: 'build-snapshot' | 'run-blueprint' }): Promise<void>;
  export function runCLI(args: RunCLIArgs): Promise<RunCLIServer | void>;

  export function parseOptionsAndRunCLI(argsToParse: string[]): Promise<void>;
}
