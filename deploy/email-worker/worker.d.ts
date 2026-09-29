/** Types for tests; the Worker itself is plain JavaScript for pasting into Cloudflare. */
export interface WorkerEnv {
  APP_INBOUND_URL: string;
  INBOUND_EMAIL_SECRET: string;
  FALLBACK_TO?: string;
  FORWARD_OTHER_TO?: string;
}
export interface WorkerMessage {
  to: string;
  from: string;
  raw: ReadableStream;
  setReject(reason: string): void;
  forward(to: string): unknown;
}
declare const worker: { email(message: WorkerMessage, env: WorkerEnv): Promise<unknown> };
export default worker;
export function sign(
  secret: string,
  timestamp: string,
  recipient: string,
  raw: Uint8Array,
): Promise<string>;
