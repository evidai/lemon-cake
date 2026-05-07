#!/usr/bin/env node
// lemon-cake-mcp v0.5.0+ — thin wrapper that boots the renamed `pay-per-call-mcp`
// package. Keeps existing `npx -y lemon-cake-mcp` Claude Desktop configs working
// while we migrate users to the new name.
//
// To silence the deprecation banner, switch your config to:
//   args: ["-y", "pay-per-call-mcp"]

process.stderr.write(
  "[lemon-cake-mcp] DEPRECATED — this package is renamed to `pay-per-call-mcp`. " +
  "Switch your MCP client config to `npx -y pay-per-call-mcp` to silence this notice. " +
  "Same code, better search.\n"
);

await import("pay-per-call-mcp/dist/index.js");
