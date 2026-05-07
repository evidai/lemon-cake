# lemon-cake-mcp (deprecated alias)

> 📦 **This package has been renamed to [`pay-per-call-mcp`](https://www.npmjs.com/package/pay-per-call-mcp).**

`lemon-cake-mcp` v0.5.0+ is now a thin wrapper that boots `pay-per-call-mcp` so existing `npx -y lemon-cake-mcp` Claude Desktop / Cursor / Cline configurations keep working without a code change.

## Migrate

Switch your MCP client config from:

```json
{ "command": "npx", "args": ["-y", "lemon-cake-mcp"] }
```

to:

```json
{ "command": "npx", "args": ["-y", "pay-per-call-mcp"] }
```

The wrapper prints a one-line deprecation notice on stderr until you migrate. Stderr does not affect MCP stdio communication, so the wrapper is functionally identical to using the new package directly.

## Why the rename?

`lemon-cake-mcp` was a brand name that didn't appear in npm/Glama search for "pay per call", "agent payment", "USDC MCP", etc. The new name makes the package discoverable to people searching for the actual problem it solves. The brand (LemonCake) lives on at [lemoncake.xyz](https://lemoncake.xyz).

## Source

- New package: [pay-per-call-mcp on npm](https://www.npmjs.com/package/pay-per-call-mcp)
- Source code: [evidai/lemon-cake on GitHub](https://github.com/evidai/lemon-cake)
- Glama listing: [LemonCake — AI Agent Wallet & USDC Pay-per-call](https://glama.ai/mcp/servers/evidai/lemon-cake)

## License

MIT © LemonCake
