import { z } from "zod";
import { RotateDeveloperWalletKeyBody } from "@workspace/api-zod";

// Keep server-only constraints and strict unknown-key rejection at the boundary.
export const walletKeyInput = RotateDeveloperWalletKeyBody.strict();
export const checkoutCommand = z.object({
  requestId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  checkoutId: z.string().uuid().optional(),
  reason: z.string().trim().min(3).max(300).optional(),
  paused: z.boolean().optional(),
  amountSats: z.number().int().min(-1000000000).max(1000000000).optional(),
  returnUrls: z.array(z.string().max(1000)).max(5).optional(),
  webhookUrl: z.string().max(1000).optional(),
}).strict();
export const checkoutInput = z.object({
  amount_sats: z.number().int().positive().max(10000000),
  reference: z.string().trim().min(1).max(100),
  return_url: z.string().max(1000),
}).strict();
