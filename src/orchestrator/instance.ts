import type { RunCLIServer } from '@wp-playground/cli';
import type { InstanceMetadata, InstanceStatus } from './types.js';
import { logger } from '../utils/logger.js';
import { releasePort } from '../utils/ports.js';
import { initializeMcpSession } from '../utils/mcp-session.js';

export interface PlaygroundInstanceOptions {
  id: string;
  name: string;
  port: number;
  server: RunCLIServer;
  phpVersion: string;
  wpVersion: string;
}

/**
 * Check if a single endpoint is responding to HTTP requests.
 *
 * Uses WordPress Playground auto-login cookie to prevent redirect loops.
 * Accepts any HTTP status code (including redirects) as "ready".
 *
 * @param url - Endpoint URL to check
 * @param timeoutMs - Request timeout in milliseconds (default: 2000)
 * @returns true if endpoint responds, false if unreachable or timeout
 */
async function checkEndpointReady(url: string, timeoutMs: number = 2000): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        // Include WordPress Playground auto-login cookie to bypass redirect loop
        'Cookie': 'playground_auto_login_already_happened=1',
      },
      redirect: 'manual',
    });
    // Any HTTP response (including 200, 302, 404) means server is up
    // 302 is expected with the auto-login cookie and indicates server is working
    return response.status > 0;
  } catch {
    return false;
  }
}

/**
 * Check both web server and MCP endpoint in parallel for faster results.
 *
 * @param webUrl - Main WordPress URL
 * @param mcpEndpoint - MCP Adapter REST API endpoint
 * @param timeoutMs - Timeout per endpoint (default: 2000ms)
 * @returns Object with readiness status for each endpoint
 */
async function checkInstanceReady(
  webUrl: string,
  mcpEndpoint: string,
  timeoutMs: number = 2000
): Promise<{ webReady: boolean; mcpReady: boolean }> {
  const [webReady, mcpReady] = await Promise.all([
    checkEndpointReady(webUrl, timeoutMs),
    checkEndpointReady(mcpEndpoint, timeoutMs),
  ]);

  return { webReady, mcpReady };
}

/**
 * Wait for instance to become ready with adaptive backoff strategy.
 *
 * Uses aggressive retry schedule:
 * - First 2 seconds: 50-200ms intervals (fast polling)
 * - Next 2 seconds: 500ms intervals
 * - Next 4 seconds: 1000ms intervals
 * - Remaining time: 2000ms intervals
 *
 * Both endpoints must be ready for success.
 *
 * @param webUrl - Main WordPress URL
 * @param mcpEndpoint - MCP Adapter REST API endpoint
 * @param maxWaitMs - Maximum wait time in milliseconds (default: 90000)
 * @returns Object with success status, endpoint states, and attempt count
 */
async function waitForInstanceReady(
  webUrl: string,
  mcpEndpoint: string,
  maxWaitMs: number = 90000
): Promise<{ success: boolean; webReady: boolean; mcpReady: boolean; attempts: number }> {
  const startTime = Date.now();
  let attempt = 0;

  // Adaptive backoff schedule: start fast, slow down gradually
  const backoffSchedule = [
    50, 50, 100, 100, 150, 150, 200, 200, 300, 300, // First 2 seconds: very fast
    500, 500, 500, 500, // Next 2 seconds: fast
    1000, 1000, 1000, 1000, // Next 4 seconds: moderate
    2000 // After that: slow
  ];

  let webReady = false;
  let mcpReady = false;

  while (Date.now() - startTime < maxWaitMs) {
    attempt++;

    // Check both endpoints in parallel
    const result = await checkInstanceReady(webUrl, mcpEndpoint, 2000);
    webReady = result.webReady;
    mcpReady = result.mcpReady;

    // Success: both endpoints are ready
    if (webReady && mcpReady) {
      return { success: true, webReady: true, mcpReady: true, attempts: attempt };
    }

    // Wait before next attempt using adaptive backoff
    const backoffIndex = Math.min(attempt - 1, backoffSchedule.length - 1);
    const waitMs = backoffSchedule[backoffIndex];

    // Don't wait if we're about to exceed timeout
    if (Date.now() - startTime + waitMs >= maxWaitMs) {
      break;
    }

    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  // Timeout: return current state
  return { success: false, webReady, mcpReady, attempts: attempt };
}

/**
 * Represents a running WordPress Playground instance with MCP support.
 *
 * Manages the lifecycle of a Playground server including:
 * - Health monitoring (readiness checks)
 * - MCP session management
 * - Resource cleanup (stop/dispose)
 * - Instance metadata
 */
export class PlaygroundInstance {
  public readonly id: string;
  public readonly name: string;
  public readonly port: number;
  public readonly phpVersion: string;
  public readonly wpVersion: string;
  public readonly createdAt: Date;

  private server: RunCLIServer;
  private _status: InstanceStatus = 'starting';
  private _lastHealthCheck?: Date;
  private _readyAt?: Date;
  private _mcpSessionId?: string;

  /**
   * Get the underlying Playground server instance.
   * Provides access to the Playground API (writeFile, runPHP, etc.)
   */
  get playground(): RunCLIServer['playground'] {
    return this.server.playground;
  }

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
   * Get the MCP session ID (initialized after instance is ready)
   */
  get mcpSessionId(): string | undefined {
    return this._mcpSessionId;
  }

  /**
   * Initialize MCP session (must be called after instance is ready)
   */
  async initializeMcpSession(): Promise<void> {
    if (this._mcpSessionId) {
      logger.debug(`MCP session already initialized for instance ${this.id}`);
      return;
    }

    logger.debug(`Initializing MCP session for instance ${this.id}`);

    try {
      const session = await initializeMcpSession(this.mcpEndpoint, {
        name: 'playground-mcp',
        version: '0.1.0',
      });

      this._mcpSessionId = session.sessionId;

      logger.info(`MCP session initialized for instance ${this.id}`, {
        sessionId: session.sessionId,
        serverInfo: session.serverInfo,
      });
    } catch (error) {
      logger.error(`Failed to initialize MCP session for instance ${this.id}`, error);
      throw error;
    }
  }

  /**
   * Get time when instance became ready
   */
  get readyAt(): Date | undefined {
    return this._readyAt;
  }

  /**
   * Get time since instance became ready (in ms)
   */
  get uptime(): number | undefined {
    if (!this._readyAt) return undefined;
    return Date.now() - this._readyAt.getTime();
  }

  /**
   * Get timestamp of last health check
   */
  get lastHealthCheck(): Date | undefined {
    return this._lastHealthCheck;
  }

  /**
   * Wait for the instance to be ready with optimized parallel health checks.
   *
   * Checks both web server and MCP endpoint in parallel using adaptive
   * backoff. Updates instance status to 'running' on success or 'error' on timeout.
   *
   * @param timeoutMs - Maximum wait time in milliseconds (default: 90000)
   * @returns true if instance became ready, false if timeout
   */
  async waitUntilReady(timeoutMs: number = 90000): Promise<boolean> {
    logger.info(`Waiting for instance ${this.id} to be ready...`);
    const startTime = Date.now();

    const result = await waitForInstanceReady(
      this.webUrl,
      this.mcpEndpoint,
      timeoutMs
    );

    const elapsedMs = Date.now() - startTime;

    if (result.success) {
      this._status = 'running';
      this._readyAt = new Date();
      logger.info(
        `Instance ${this.id} is ready at ${this.webUrl} (${elapsedMs}ms, ${result.attempts} attempts)`
      );
      return true;
    } else {
      this._status = 'error';
      const errorDetails = [];
      if (!result.webReady) errorDetails.push('web server not responding');
      if (!result.mcpReady) errorDetails.push('MCP endpoint not responding');

      logger.error(
        `Instance ${this.id} failed to start after ${elapsedMs}ms (${result.attempts} attempts): ${errorDetails.join(', ')}`
      );
      return false;
    }
  }

  /**
   * Perform a quick health check to verify instance is still responsive.
   *
   * Checks both endpoints in parallel. Updates status to 'error' if unhealthy.
   * Only performs check if instance status is 'running'.
   *
   * @param timeoutMs - Timeout per endpoint (default: 3000ms)
   * @returns Object with overall health and individual endpoint status
   */
  async checkHealth(timeoutMs: number = 3000): Promise<{ healthy: boolean; webReady: boolean; mcpReady: boolean }> {
    if (this._status !== 'running') {
      return { healthy: false, webReady: false, mcpReady: false };
    }

    const result = await checkInstanceReady(this.webUrl, this.mcpEndpoint, timeoutMs);
    this._lastHealthCheck = new Date();

    const healthy = result.webReady && result.mcpReady;

    // Update status if unhealthy
    if (!healthy && this._status === 'running') {
      this._status = 'error';
      logger.warn(`Instance ${this.id} failed health check`, result);
    }

    return {
      healthy,
      webReady: result.webReady,
      mcpReady: result.mcpReady,
    };
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
