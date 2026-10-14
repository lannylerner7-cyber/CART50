// Bitcoin Core names mainnet "main". Do not silently treat invalid input as Signet.
export function configuredNetwork(): "main" | "signet" | "regtest" {
  const network = process.env.BITCOIN_NETWORK || "signet";
  if (network !== "main" && network !== "signet" && network !== "regtest") {
    throw new Error("BITCOIN_NETWORK must be main, signet or regtest");
  }
  if (network === "main" && process.env.ALLOW_MAINNET !== "true") {
    throw new Error("Mainnet requires explicit ALLOW_MAINNET=true");
  }
  return network;
}
