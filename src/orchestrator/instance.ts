import type { RunCLIServer } from '@wp-playground/cli';
import type { InstanceMetadata, InstanceStatus } from './types.js';
import { logger } from '../utils/logger.js';
import { releasePort } from '../utils/ports.js';
import { waitForEndpoint } from '../utils/http-client.js';

export interface PlaygroundInstanceOptions {
  id: string;
  name: string;
  port: number;
  server: RunCLIServer;
  phpVersion: string;
  wpVersion: string;
}

export class PlaygroundInstance {
  public readonly id: string;
  public readonly name: string;
  public readonly port: number;
  public readonly phpVersion: string;
  public readonly wpVersion: string;
  public readonly createdAt: Date;

  private server: RunCLIServer;
  private _status: InstanceStatus = 'starting';

  constructor(options: PlaygroundInstanceOptions) {
    this.id = options.id;
    this.name = options.name;
    this.port = options.port;
    this.server = options.server;
    this.phpVersion = options.phpVersion;
    this.wpVersion = options.wpVersion;
    this.createdAt = new Date();
  }

  get status(): InstanceStatus {
    return this._status;
  }

  get webUrl(): string {
    return `http://localhost:${this.port}`;
  }

  get adminUrl(): string {
    return `http://localhost:${this.port}/wp-admin/`;
  }

  get mcpEndpoint(): string {
    return `http://localhost:${this.port}/wp-json/mcp/mcp-adapter-default-server`;
  }

  /**
   * Wait for the instance to be ready
   */
  async waitUntilReady(timeoutMs: number = 90000): Promise<boolean> {
    logger.info(`Waiting for instance ${this.id} to be ready...`);

    // Use exponential backoff starting at 100ms
    // With 60 max attempts and exponential backoff, this will check:
    // - Quickly at first (100ms, 150ms, 225ms, etc.)
    // - Then settle into 2s intervals
    // Total max wait time is still ~90 seconds
    const ready = await waitForEndpoint(
      this.webUrl,
      60,
      100
    );

    if (ready) {
      this._status = 'running';
      logger.info(`Instance ${this.id} is ready at ${this.webUrl}`);
    } else {
      this._status = 'error';
      logger.error(`Instance ${this.id} failed to start`);
    }

    return ready;
  }

  /**
   * Stop the instance
   */
  async stop(): Promise<void> {
    if (this._status === 'stopped' || this._status === 'stopping') {
      return;
    }

    this._status = 'stopping';
    logger.info(`Stopping instance ${this.id}...`);

    try {
      // Use Symbol.asyncDispose for cleanup
      await this.server[Symbol.asyncDispose]();

      releasePort(this.port);
      this._status = 'stopped';
      logger.info(`Instance ${this.id} stopped`);
    } catch (error) {
      logger.error(`Error stopping instance ${this.id}`, error);
      this._status = 'error';
      throw error;
    }
  }

  /**
   * Get metadata about this instance
   */
  metadata(): InstanceMetadata {
    return {
      id: this.id,
      name: this.name,
      port: this.port,
      status: this._status,
      phpVersion: this.phpVersion,
      wpVersion: this.wpVersion,
      createdAt: this.createdAt.toISOString(),
      webUrl: this.webUrl,
      mcpEndpoint: this.mcpEndpoint,
    };
  }
}
