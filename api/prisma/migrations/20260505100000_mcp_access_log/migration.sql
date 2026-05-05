-- McpAccessLog: SDK / plugin / MCP server access log
--
-- Captures every API request whose User-Agent matches a known SDK family
-- (lemon-cake-mcp, eliza-plugin-lemoncake, create-lemon-agent, etc.).
-- Distinct from /api/telemetry/client-usage which reads Token.clientUserAgent
-- and therefore only sees dashboard-issued tokens.
--
-- Production deploys via prisma db push --accept-data-loss; this file is
-- descriptive.

CREATE TABLE "mcp_access_logs" (
  "id"        TEXT    PRIMARY KEY,
  "path"      TEXT    NOT NULL,
  "method"    TEXT    NOT NULL,
  "family"    TEXT    NOT NULL,
  "version"   TEXT    NOT NULL,
  "status"    INTEGER NOT NULL,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "mcp_access_logs_family_version_createdAt_idx" ON "mcp_access_logs" ("family", "version", "createdAt");
CREATE INDEX "mcp_access_logs_path_createdAt_idx"           ON "mcp_access_logs" ("path", "createdAt");
CREATE INDEX "mcp_access_logs_createdAt_idx"                ON "mcp_access_logs" ("createdAt");
