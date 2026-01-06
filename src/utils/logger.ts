export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private level: LogLevel = LogLevel.INFO;

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private log(level: LogLevel, prefix: string, message: string, data?: unknown): void {
    if (level < this.level) return;

    const timestamp = new Date().toISOString();
    const logMessage = data
      ? `[${timestamp}] ${prefix}: ${message} ${JSON.stringify(data)}`
      : `[${timestamp}] ${prefix}: ${message}`;

    // Always write to stderr to avoid interfering with MCP protocol on stdout
    console.error(logMessage);
  }

  debug(message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log(LogLevel.INFO, 'INFO', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log(LogLevel.WARN, 'WARN', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log(LogLevel.ERROR, 'ERROR', message, data);
  }
}

export const logger = new Logger();
