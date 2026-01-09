/**
 * Utility to suppress stdout during async operations.
 *
 * This is necessary because @wp-playground/cli writes progress messages
 * to stdout which would pollute the MCP JSON-RPC protocol.
 *
 * We redirect stdout writes to stderr so they appear in logs but don't
 * break the MCP communication.
 */

/**
 * Execute an async function while suppressing stdout output.
 * Any stdout writes are redirected to stderr to preserve logs.
 */
export async function withSuppressedStdout<T>(fn: () => Promise<T>): Promise<T> {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);

  // Replace stdout.write with a function that redirects to stderr
  // Using Function type to avoid complex overload typing issues
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout as any).write = (
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((err?: Error | null) => void),
    callback?: (err?: Error | null) => void
  ): boolean => {
    // Redirect to stderr instead of stdout
    if (typeof encodingOrCallback === 'function') {
      return process.stderr.write(chunk, encodingOrCallback);
    }
    return process.stderr.write(chunk, encodingOrCallback, callback);
  };

  try {
    return await fn();
  } finally {
    // Restore original stdout
    process.stdout.write = originalStdoutWrite;
  }
}
