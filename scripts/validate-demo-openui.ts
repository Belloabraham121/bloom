/** Offline validation of OpenUI fragments/messages with the real parser. */
import { createParser } from "@openuidev/lang-core";
import { bloomLibrarySpec } from "@/lib/openui/bloom-spec";
import {
  normalizeOpenUIContent,
  looksLikeOpenUI,
} from "@/lib/openui/detect";
import { normalizeSlotOpenui } from "@/server/services/canvas/model";

const parser = createParser(
  (bloomLibrarySpec as unknown as { schema: Parameters<typeof createParser>[0] }).schema
);

type CheckResult = {
  root?: unknown;
  incomplete?: boolean;
  errors?: Array<{ code?: string; message?: string }>;
};

function check(label: string, text: string) {
  const result = parser.parse(text) as unknown as CheckResult;
  const errors = result.errors || [];
  console.log(`--- ${label} ---`);
  console.log(`root: ${result.root ? "RESOLVED" : "null"}, incomplete: ${result.incomplete}`);
  console.log(
    `errors: ${errors.length ? errors.map((e) => `${e.code}: ${e.message}`).join(" | ") : "none"}`
  );
}

// A. Seeded market slot fragment, wrapped exactly like CanvasSlotView does.
const marketFragment = [
  `Stack([title, tick, chart, controls])`,
  `title = TextContent("ETH/USDC paper", "large-heavy")`,
  `tick = DemoMarketTick(feedId="USDC_ETH", title="Market")`,
  `chart = DemoMarketChart(feedId="USDC_ETH", title="Price chart")`,
  `controls = DemoFeedControls(feedId="USDC_ETH")`,
].join("\n");
check("A. seed market fragment (slot-wrapped)", normalizeSlotOpenui(marketFragment));

// B. Full seeded shell.
const shell = [
  `root = Stack([world])`,
  `world = CanvasWorld([title, panel0])`,
  `title = TextContent("Paper trading desk", "large-heavy")`,
  `panel0 = CanvasSlot("demo_usdc_eth", 40, 80)`,
].join("\n");
check("B. full seeded shell", shell);

// C. Simulated model reply: prose + truncated program (the failure mode).
const mixed = [
  `I'll start a paper trading desk for you.`,
  `root = Stack([world])`,
  `world = CanvasWorld([title, live_slot`,
].join("\n");
const normalized = normalizeOpenUIContent(mixed);
console.log(`--- C. mixed message ---`);
console.log(`looksLikeOpenUI: ${looksLikeOpenUI(mixed, false)} (must be false)`);
console.log(`looksLikeOpenUI streaming: ${looksLikeOpenUI(mixed, true)} (must be false)`);
check("C. mixed message normalized", normalized);

// D. Execution fragment with side/amount props.
const execFragment = [
  `Stack([title, status])`,
  `title = TextContent("Paper execution", "large-heavy")`,
  `status = DemoExecution(feedId="USDC_ETH", title="Execution", side="buy", amount="25")`,
].join("\n");
check("D. execution fragment (slot-wrapped)", normalizeSlotOpenui(execFragment));

// F. Streaming partial of a genuine program (root-first) must still route live.
const partial = `root = Stack([world])\nworld = CanvasWorld([title`;
console.log(`--- F. streaming partial ---`);
console.log(`looksLikeOpenUI streaming: ${looksLikeOpenUI(partial, true)} (must be true)`);
console.log(`looksLikeOpenUI final: ${looksLikeOpenUI(partial, false)} (must be true)`);

// G. Pure prose mentioning components must stay markdown.
const prose = `Open the Markets panel and check the live BalanceBoard summary.`;
console.log(`--- G. prose ---`);
console.log(`looksLikeOpenUI: ${looksLikeOpenUI(prose, false)} (must be false)`);
const lpFragment = [
  `Stack([title, position])`,
  `title = TextContent("Paper liquidity", "large-heavy")`,
  `position = DemoLiquidity(feedId="USDC_ETH", title="Liquidity", usdcAmount="25")`,
].join("\n");
check("E. liquidity fragment (slot-wrapped)", normalizeSlotOpenui(lpFragment));
