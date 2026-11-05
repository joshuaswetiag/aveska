/** Minimal Cloudflare binding shapes so the app compiles without ambient Workers globals. */

export type D1Database = {
  prepare(query: string): unknown;
  batch<T = unknown>(statements: unknown[]): Promise<T[]>;
  exec(query: string): Promise<unknown>;
};

export type R2ObjectBody = {
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type R2Bucket = {
  put(key: string, value: ArrayBuffer | ArrayBufferView | string | Blob | null): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
};

export type WorkerAssetFetcher = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

export type WorkerExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
};

export type WorkerScheduledController = {
  scheduledTime: number;
  cron: string;
  noRetry(): void;
};
