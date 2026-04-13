import type { UsageLog } from "../types/usage-log.js";

export type UsageLogHandler = (log: UsageLog) => void | Promise<void>;

const defaultHandler: UsageLogHandler = (log) => {
  const line = JSON.stringify(log);
  console.log(`[usage] ${line}`);
};

export class UsageLogger {
  private readonly handlers: UsageLogHandler[] = [];

  constructor(handler?: UsageLogHandler) {
    this.handlers.push(handler ?? defaultHandler);
  }

  addHandler(handler: UsageLogHandler): void {
    this.handlers.push(handler);
  }

  async log(entry: UsageLog): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler(entry);
      } catch {
        // don't let logging failures break the request path
      }
    }
  }
}
