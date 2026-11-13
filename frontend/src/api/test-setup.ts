// Test setup (referenced by vite.config.ts `setupFiles`).
// Tests run in the `node` environment, so there is no localStorage; the demo
// API tolerates that (its reads/writes are wrapped in try/catch) and keeps
// state in memory for the duration of a test run.
