import { createServer } from 'net';

const usedPorts = new Set<number>();

/**
 * Check if a port is available
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
 * Find the next available port starting from the given port
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
 * Release a port back to the pool
 */
export function releasePort(port: number): void {
  usedPorts.delete(port);
}
