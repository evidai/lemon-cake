/**
 * LemonCake Incident Contract v0
 * ════════════════════════════════════════════════════════════════════════
 * A compact, signed audit artifact emitted per charge so ops teams can
 * answer these four questions WITHOUT stitching logs:
 *
 *   1. was this call allowed?           → intent
 *   2. was it charged correctly?         → execution
 *   3. can it be replayed safely?        → recovery
 *   4. who owns any exception?           → ownership
 *
 * Shape proposed by @oimrqsops (ElizaOS ops). v0 uses a single
 * `owner_queue` field; a state-machine handoff log can be added in v1
 * once multiple queues can touch the same incident.
 */

import { z } from "zod";
import type { Charge, Token, Buyer } from "@prisma/client";

export const CONTRACT_VERSION = "v0" as const;

// ─── Zod schema (source of truth) ────────────────────────────────────────

const IntentSchema = z.object({
  contract_version:  z.literal(CONTRACT_VERSION),
  workflow_id:       z.string().nullable(),
  agent_id:          z.string().nullable(),
  request_id:        z.string().nullable(),
  scope: z.object({
    service_id:      z.string(),
    buyer_id:        z.string(),
    buyer_tag:       z.string().nullable(),
  }),
  max_spend: z.object({
    limit_usdc:      z.string(),
    used_usdc:       z.string(),
  }),
  expiry:            z.string(),                   // ISO-8601
  allowed_upstreams: z.array(z.string()),
});

const ExecutionSchema = z.object({
  call_id:           z.string(),                   // = charge.id
  input_hash:        z.string().nullable(),        // sha256:...
  response_hash:     z.string().nullable(),        // sha256:...
  token_id:          z.string(),
  charge_amount:     z.string(),                   // USDC Decimal as string
  provider_status:   z.number().int().nullable(),  // upstream HTTP status
  charge_status:     z.enum(["PENDING", "COMPLETED", "FAILED"]),
  tx_hash:           z.string().nullable(),
});

const RecoverySchema = z.object({
  idempotency_key:       z.string(),
  retry_policy:          z.unknown().nullable(),
  replay_safe:           z.boolean(),
  compensating_action:   z.string().nullable(),    // e.g. "refund", "reverse-entry"
  revoke_reason:         z.string().nullable(),
  reconcile_status:      z.enum(["OPEN", "ANNOTATED", "CLOSED", "DISPUTED"]),
});

const OwnershipSchema = z.object({
  owner_queue:    z.string().nullable(),
  owner_reason:   z.string().nullable(),
  escalated_at:   z.string().nullable(),           // ISO-8601
});

export const IncidentContractV0Schema = z.object({
  intent:     IntentSchema,
  execution:  ExecutionSchema,
  recovery:   RecoverySchema,
  ownership:  OwnershipSchema,
  emitted_at: z.string(),                          // ISO-8601
});

export type IncidentContractV0 = z.infer<typeof IncidentContractV0Schema>;

// ─── Builder ─────────────────────────────────────────────────────────────

export interface BuildIncidentContractArgs {
  charge: Pick<
    Charge,
    | "id"
    | "amountUsdc"
    | "status"
    | "idempotencyKey"
    | "txHash"
    | "requestId"
    | "workflowId"
    | "agentId"
    | "inputHash"
    | "responseHash"
    | "providerStatus"
    | "revokeReason"
    | "reconcileStatus"
    | "ownerQueue"
    | "ownerReason"
    | "escalatedAt"
  >;
  token: Pick<
    Token,
    | "id"
    | "serviceId"
    | "buyerId"
    | "buyerTag"
    | "limitUsdc"
    | "usedUsdc"
    | "expiresAt"
    | "allowedUpstreams"
    | "retryPolicy"
    | "replaySafe"
  >;
  buyer?: Pick<Buyer, "id">;
}

export function buildIncidentContract(args: BuildIncidentContractArgs): IncidentContractV0 {
  const { charge, token } = args;

  return {
    intent: {
      contract_version:  CONTRACT_VERSION,
      workflow_id:       charge.workflowId ?? null,
      agent_id:          charge.agentId ?? null,
      request_id:        charge.requestId ?? null,
      scope: {
        service_id: token.serviceId,
        buyer_id:   token.buyerId,
        buyer_tag:  token.buyerTag ?? null,
      },
      max_spend: {
        limit_usdc: token.limitUsdc.toFixed(6),
        used_usdc:  token.usedUsdc.toFixed(6),
      },
      expiry:            token.expiresAt.toISOString(),
      allowed_upstreams: token.allowedUpstreams ?? [],
    },
    execution: {
      call_id:         charge.id,
      input_hash:      charge.inputHash,
      response_hash:   charge.responseHash,
      token_id:        token.id,
      charge_amount:   charge.amountUsdc.toFixed(6),
      provider_status: charge.providerStatus,
      charge_status:   charge.status,
      tx_hash:         charge.txHash,
    },
    recovery: {
      idempotency_key:     charge.idempotencyKey,
      retry_policy:        (token.retryPolicy as unknown) ?? null,
      replay_safe:         token.replaySafe,
      compensating_action: null,            // annotate endpoint updates this later
      revoke_reason:       charge.revokeReason,
      reconcile_status:    charge.reconcileStatus,
    },
    ownership: {
      owner_queue:  charge.ownerQueue,
      owner_reason: charge.ownerReason,
      escalated_at: charge.escalatedAt?.toISOString() ?? null,
    },
    emitted_at: new Date().toISOString(),
  };
}
