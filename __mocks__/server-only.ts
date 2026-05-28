// Vitest environment mock — suppresses Next.js 'server-only' guard.
// The server-only package throws when imported outside the Next.js
// server runtime. In Vitest (plain Node), we replace it with a no-op.
export {};
