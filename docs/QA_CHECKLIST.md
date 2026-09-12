# Bloom — Autonomous tx hub + infinite canvas — QA checklist

Verifier owns this file. Status: `missing` | `partial` | `implemented` | `deferred:<note>`.
Nothing advances while a required row is `missing`/`partial` without `deferred:`.
**Nothing is committed or pushed until Verifier PASS** for that workstream slice.
Commits must never use Cursor as author, message body, trailer, or co-authored-by.

Roles: **Coordinator → SpecChecker → Implementer → Breaker → Fixer → VisualQA → AgentQA → Verifier → Committer**.

## Commit-after-fix (required)

After Implementer or Fixer finishes a slice: Breaker/tests → Verifier PASS → **Committer commits** before next workstream.

| Check | Status |
| --- | --- |
| Every completed fix ends in a Verifier PASS + commit | partial — first ship commit pending |
| Zero Cursor co-author on commits | implemented — filter history + cli attribution off |

## Sub-agent spin-up

```text
Role: <Coordinator|SpecChecker|Implementer|Breaker|Fixer|VisualQA|AgentQA|Verifier|Committer>
Product: Bloom autonomous tx hub + infinite canvas + wallet ops
Workstream: <W1|W2|W3|W4|W5|W6|W7|W8>
Read: docs/QA_CHECKLIST.md
Constraints:
  - OpenUI for GenUI frames; floating hub is fixed chrome; camera over infinite stage
  - Autonomous broadcast only when agent_mode=autonomous and kill_switch=false
  - After any fix: tests + Verifier PASS + Committer commit before next workstream
  - commits: zero Cursor co-author / branding
```

## Workstreams

### W1 Hub — Floating transaction hub

| Check | Status |
| --- | --- |
| `transaction-hub.tsx` pill + expand sheet | implemented |
| Drag Y + localStorage persist | implemented |
| Hydrate GET /api/uniswap/tx | implemented |
| SSE merge into hub list (via tapeRows) | implemented |
| Mounted in chat-shell (screen space) | implemented |

### W2 Intent — trade_intents persistence

| Check | Status |
| --- | --- |
| Intent written on quote/propose (DCA + transfer) | implemented |
| Linked to transactions on broadcast | implemented |

### W3 AutoExec — DCA harden

| Check | Status |
| --- | --- |
| swapper = user wallet address | implemented |
| maxNotionalUsd / kill switch enforced | implemented |
| Runner reliable with live session | partial — existing runner; deferred:long-lived worker hardening |

### W4 Confirm — human confirm → execute

| Check | Status |
| --- | --- |
| ConfirmTx → bloom:confirm-tx → POST /api/wallet/execute | implemented |
| ConfirmSend → same event path | implemented |
| human_mediated execute_prepared_tx needs confirmed=true | implemented |

### W5 InfiniteCanvas — pan / zoom / frames

| Check | Status |
| --- | --- |
| Infinite stage with camera x/y/zoom | implemented |
| Wheel zoom + drag pan | implemented |
| CanvasFrame / CanvasSlot x,y placement | implemented |
| Composer + hub stay in screen space | implemented |
| Camera persisted per conversation | implemented |

### W6 BalancesSend — multi-chain + transfer

| Check | Status |
| --- | --- |
| get_wallet_balances all EVM chains | implemented |
| BalanceBoard OpenUI | implemented |
| prepare_transfer tool | implemented |
| ConfirmSend OpenUI + hub entry | implemented |

### W7 Prompts

| Check | Status |
| --- | --- |
| trading-agent documents canvas, hub, balances, send | implemented |

### W8 AgentQA

| Check | Status |
| --- | --- |
| Autonomous mission → hub quoting→submitted | deferred:manual — needs live Privy + RPC |
| Canvas pan/zoom usable with Live* frames | deferred:manual |
| Balances + send confirm path | deferred:manual |

## Verifier leak / race (every UI workstream)

| Check | Status |
| --- | --- |
| Hub unmount clears listeners / drag | implemented |
| Canvas stage dispose wheel/pointer on unmount | implemented |
| SSE subscriptions not duplicated on remount | partial — existing use-mission-live; deferred:dedicated audit |
