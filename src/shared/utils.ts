import { createHash } from "node:crypto";

export function nowInSeconds() {
  return Math.floor(Date.now() / 1000);
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
