import { createServer } from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger.js';

const execAsync = promisify(exec);

/**
 * Track ports allocated to instances to prevent collisions.
 * This is separate from OS-level port availability checks.
 */
const usedPorts = new Set<number>();

/**
 * Check if a port is available by attempting to bind to it.
 * Returns true if the port is free, false if already in use.
 *
 * @param port - Port number to check (1-65535)
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port, '127.0.0.1');
  });
}

/**
 * Find the next available port starting from the given port.
 * Checks both the internal tracking set and OS-level availability.
 *
 * @param startPort - Port to start searching from
 * @returns First available port number
 * @throws Error if no ports available up to 65535
 */
export async function findAvailablePort(startPort: number): Promise<number> {
  let port = startPort;

  while (usedPorts.has(port) || !(await isPortAvailable(port))) {
    port++;
    if (port > 65535) {
      throw new Error('No available ports found');
    }
  }

  usedPorts.add(port);
  return port;
}

/**
 * Release a port back to the available pool.
 * Should be called when an instance using this port is destroyed.
 *
 * @param port - Port number to release
 */
export function releasePort(port: number): void {
  usedPorts.delete(port);
}

/**
 * Information about a process using a port
 */
export interface PortProcessInfo {
  pid: number;
  port: number;
  command: string;
  isPlayground: boolean;
}

/**
 * Get information about the process using a port.
 * Uses lsof to find the process and identify if it's a Playground instance.
 *
 * @param port - Port number to check
 * @returns Process information or null if port is not in use
 */
export async function getProcessOnPort(port: number): Promise<PortProcessInfo | null> {
  try {
    // Use lsof to find the process
    // -i :PORT = show process using this port
    // -t = show only PID (terse output)
    // -sTCP:LISTEN = only show listening sockets
    const { stdout } = await execAsync(`lsof -i :${port} -sTCP:LISTEN -t`);
    const pidStr = stdout.trim();

    if (!pidStr) {
      return null;
    }

    const pid = parseInt(pidStr, 10);

    // Get process command
    try {
      const { stdout: cmdOutput } = await execAsync(`ps -p ${pid} -o command=`);
      const command = cmdOutput.trim();

      // Check if this is a WordPress Playground process
      // Playground processes typically contain these patterns in the command
      const isPlayground =
        command.includes('@wp-playground/cli') ||
        command.includes('wp-playground') ||
        command.includes('node-wordpress') ||
        command.includes('playground-mcp') ||
        // Check for PHP processes spawned by Playground
        command.includes('php-web.js') ||
        command.includes('php-wasm');

      return {
        pid,
        port,
        command,
        isPlayground,
      };
    } catch {
      // If we can't get command info, assume it's not a Playground process
      return {
        pid,
        port,
        command: '<unknown>',
        isPlayground: false,
      };
    }
  } catch {
    // Port is not in use or lsof failed
    return null;
  }
}

/**
 * Kill a process by PID using the specified signal.
 * SIGTERM allows graceful shutdown, SIGKILL forces immediate termination.
 *
 * @param pid - Process ID to kill
 * @param signal - Signal to send (default: SIGTERM)
 * @returns true if process was killed, false otherwise
 */
export async function killProcess(pid: number, signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM'): Promise<boolean> {
  try {
    await execAsync(`kill -${signal} ${pid}`);

    // Wait a bit to see if process died
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check if process still exists
    try {
      await execAsync(`ps -p ${pid}`);
      // Process still exists
      return false;
    } catch {
      // Process is gone
      return true;
    }
  } catch {
    return false;
  }
}

/**
 * Attempt to free a port by killing the process using it.
 * By default, only kills Playground processes. Use force=true to kill any process.
 *
 * Tries SIGTERM first (graceful), then SIGKILL if needed (forceful).
 *
 * @param port - Port to free
 * @param force - If true, kills non-Playground processes too (default: false)
 * @returns true if port was freed, false otherwise
 */
export async function freePort(port: number, force: boolean = false): Promise<boolean> {
  const processInfo = await getProcessOnPort(port);

  if (!processInfo) {
    // Port is already free
    return true;
  }

  // Only kill Playground processes unless force is true
  if (!processInfo.isPlayground && !force) {
    logger.warn(`Port ${port} is in use by non-Playground process (PID ${processInfo.pid}). Use force=true to kill it.`, {
      command: processInfo.command,
    });
    return false;
  }

  logger.info(`Attempting to free port ${port} by killing process ${processInfo.pid}`, {
    command: processInfo.command,
    isPlayground: processInfo.isPlayground,
  });

  // Try SIGTERM first (graceful)
  const terminated = await killProcess(processInfo.pid, 'SIGTERM');

  if (terminated) {
    logger.info(`Process ${processInfo.pid} terminated gracefully`);
    return true;
  }

  // If SIGTERM didn't work, try SIGKILL (force)
  logger.warn(`Process ${processInfo.pid} did not respond to SIGTERM, using SIGKILL`);
  const killed = await killProcess(processInfo.pid, 'SIGKILL');

  if (killed) {
    logger.info(`Process ${processInfo.pid} killed forcefully`);
    return true;
  }

  logger.error(`Failed to kill process ${processInfo.pid} on port ${port}`);
  return false;
}

/**
 * Scan a range of ports for orphaned Playground processes.
 * Used during startup to detect and clean up processes from previous runs.
 *
 * @param startPort - Start of port range to scan
 * @param endPort - End of port range to scan (inclusive)
 * @returns Array of Playground process information
 */
export async function findPlaygroundPorts(startPort: number, endPort: number): Promise<PortProcessInfo[]> {
  const playgroundProcesses: PortProcessInfo[] = [];

  // Check each port in parallel
  const checks = [];
  for (let port = startPort; port <= endPort; port++) {
    checks.push(
      getProcessOnPort(port).then(info => {
        if (info && info.isPlayground) {
          playgroundProcesses.push(info);
        }
      })
    );
  }

  await Promise.all(checks);

  return playgroundProcesses;
}
