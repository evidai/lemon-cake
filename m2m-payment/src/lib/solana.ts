import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import dotenv from "dotenv";

dotenv.config();

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

// Singleton connection
let _connection: Connection | null = null;

export function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(RPC_URL, "confirmed");
  }
  return _connection;
}

/**
 * Generate a brand-new Solana Keypair.
 * Returns publicKey (base58 string) and secretKey (JSON-serialized Uint8Array).
 */
export function generateKeypair(): { publicKey: string; secretKey: string } {
  const kp = Keypair.generate();
  return {
    publicKey: kp.publicKey.toBase58(),
    secretKey: JSON.stringify(Array.from(kp.secretKey)),
  };
}

/**
 * Restore a Keypair from the stored secretKey JSON string.
 */
export function keypairFromSecret(secretKeyJson: string): Keypair {
  const bytes = JSON.parse(secretKeyJson) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

/** 0.000001 SOL = 1000 lamports */
export const TRANSFER_AMOUNT_SOL = 0.000001;
export const TRANSFER_AMOUNT_LAMPORTS = Math.round(
  TRANSFER_AMOUNT_SOL * LAMPORTS_PER_SOL
);

/**
 * Execute a SOL transfer on Devnet.
 * Returns the confirmed transaction signature (txHash).
 * Throws on failure so the caller can handle retry.
 */
export async function transferSol(
  fromSecretJson: string,
  toPublicKeyStr: string
): Promise<string> {
  const connection = getConnection();
  const fromKeypair = keypairFromSecret(fromSecretJson);
  const toPublicKey = new PublicKey(toPublicKeyStr);

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey: toPublicKey,
      lamports: TRANSFER_AMOUNT_LAMPORTS,
    })
  );

  const signature = await sendAndConfirmTransaction(connection, tx, [
    fromKeypair,
  ]);
  return signature;
}
