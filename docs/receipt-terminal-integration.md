# Receipt terminal integration

## Scope and source

The owner supplied the approved MainVaultWallet Receipt Terminal Figma Make
export. Its physical housing, screen, keypad, roller and thermal-paper treatment
are adapted in `artifacts/bitcoin-vault/src/components/receipt-terminal/`.
Only relevant visual source was used, not the export's application shell,
sample receipts, live-clock order generator, looping success demo or scripts.

The reusable model/adapters live in
`artifacts/bitcoin-vault/src/lib/receipt-terminal.ts`.
There are no new payment endpoints or database tables.

## Coverage

- Personal spending submission receipt.
- Personal Activity transaction detail, for sent and received transactions.
- Personal wallet-detail transaction rows.
- Owner and developer Sandbox ledger receipt pages.
- Existing Signet receipt view, without starting Signet.
- Developer wallet-foundation deposits, withdrawals and internal transfers.
- Hosted checkout paid/expired record dialogs. Redirect behavior is unchanged.

## Receipt contract

Every view, text download and printout uses the same normalized record. Merchant
order references are used where supplied; otherwise the actual review/transaction
or ledger record ID is explicitly labelled as the reference. Full Bitcoin
addresses are retained in the screen, thermal paper, details and text exports.
References and timestamps never change with the animation or current clock.

Missing values remain unavailable. Simulation identifiers and checkout-page QR
URLs are not Bitcoin addresses. Internal transfers do not invent external
addresses. Simulation completion is labelled separately from chain confirmation;
Signet remains labelled as its actual test network.

Confirmed developer withdrawals distinguish actual debit from the approved
maximum reservation, including actual network fee, developer fee and fee refund.
Pending records do not claim a final fee/debit. Incoming receipts show the received
amount without inventing or deducting a sender's fee. Integer-satoshi arithmetic
uses BigInt and rejects unsafe numeric inputs. No USD quote is fabricated.

The motion is presentation only: a completed record feeds paper once over
approximately ten seconds, then holds. Reduced motion shows the finished
document. Pending, unknown and failed records cannot become confirmed through
animation. Download/print actions do not wait for the animation and never submit
or replay payments. Audio is not started automatically.

## Verification

- Ten pure-model regression tests passed: precise amounts, stable full
  reference/address/time export, status boundaries, network labelling, Sandbox
  completion, reservation versus final debit, missing actual fees, incoming
  totals, merchant reference and one-shot paper motion.
- Frontend typecheck and production build passed.
- Disposable owner fixture used with `VAULT_UI_FIXTURE=1`,
  `VAULT_UI_MOCK_SIGNER=1`, `VAULT_UI_RECEIPT_FIXTURE=1`. Mock history seeds one
  confirmed receive and one pending send. This is UI evidence, not chain evidence.
- First browser report verified confirmed receive binding, downloaded TXT,
  stubbed print invocation, immediate details, reduced motion, final animation
  hold, and no page/dialog horizontal overflow at 360/390/768/1280px.
- The intermediate feed-message observation timed out; it is not counted as
  independently browser-verified. The pure kinematics test verifies the feed
  interval and completion boundary.
- Escape initially closed the dialog without restoring focus. The trigger was
  moved into the same Radix Dialog root; focused follow-up results are recorded
  below rather than treating the first run as entirely passed.
- Focused follow-up passed: Escape restored focus to the exact opening trigger;
  pending sent receipt showed awaiting confirmation, 10,000 sats amount and
  10,100 sats debit, without success; personal wallet-detail's receive receipt
  opened correctly. No successful payment/data checks were broadly repeated.
- Browser contexts and downloaded text were cleaned up. The isolated server was
  stopped and its disposable credential/database directory removed.
- Final dedicated screenshot capture was unavailable in the browser/platform
  capture service. The earlier actual terminal screenshot and browser reports
  provide visual/interaction evidence; this is not physical-device or native
  printer certification.

No real transfer, mainnet/owner custody configuration change, Signet restart,
hosted migration or deployment is authorized or performed by this integration.
