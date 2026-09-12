import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  privyUserId: text("privy_user_id").notNull().unique(),
  email: text("email"),
  displayName: text("display_name"),
  agentMode: text("agent_mode").notNull().default("human_mediated"),
  agentKillSwitch: boolean("agent_kill_switch").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chainFamily: text("chain_family").notNull().default("ethereum"),
    address: text("address").notNull(),
    privyWalletId: text("privy_wallet_id"),
    isEmbedded: boolean("is_embedded").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("wallets_user_family_address").on(
      t.userId,
      t.chainFamily,
      t.address,
    ),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("conversations_user_updated").on(t.userId, t.updatedAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    contentFormat: text("content_format").notNull().default("markdown"),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("messages_conversation_created").on(t.conversationId, t.createdAt),
  ],
);

export const tradeIntents = pgTable(
  "trade_intents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    messageId: uuid("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("proposed"),
    kind: text("kind").notNull(),
    chainIdIn: integer("chain_id_in"),
    chainIdOut: integer("chain_id_out"),
    tokenIn: text("token_in"),
    tokenOut: text("token_out"),
    amountIn: text("amount_in"),
    amountOutExpected: text("amount_out_expected"),
    routing: text("routing"),
    uniswapRequestId: text("uniswap_request_id"),
    uniswapOrderId: text("uniswap_order_id"),
    quotePayload: jsonb("quote_payload"),
    calldataPayload: jsonb("calldata_payload"),
    networkFeeUsd: text("network_fee_usd"),
    error: text("error"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("trade_intents_user_status").on(t.userId, t.status)],
);

export const executionPlans = pgTable(
  "execution_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    messageId: uuid("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    uniswapPlanId: text("uniswap_plan_id").unique(),
    status: text("status").notNull().default("created"),
    planPayload: jsonb("plan_payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("execution_plans_user").on(t.userId)],
);

export const lpActions = pgTable(
  "lp_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    messageId: uuid("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    chainId: integer("chain_id"),
    poolOrPosition: text("pool_or_position"),
    status: text("status").notNull().default("proposed"),
    requestPayload: jsonb("request_payload"),
    responsePayload: jsonb("response_payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("lp_actions_user").on(t.userId)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    walletId: uuid("wallet_id").references(() => wallets.id, {
      onDelete: "set null",
    }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    messageId: uuid("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    tradeIntentId: uuid("trade_intent_id").references(() => tradeIntents.id, {
      onDelete: "set null",
    }),
    executionPlanId: uuid("execution_plan_id").references(
      () => executionPlans.id,
      {
        onDelete: "set null",
      },
    ),
    lpActionId: uuid("lp_action_id").references(() => lpActions.id, {
      onDelete: "set null",
    }),
    category: text("category").notNull(),
    provider: text("provider").notNull().default("uniswap_trade"),
    status: text("status").notNull().default("pending"),
    chainId: integer("chain_id"),
    txHash: text("tx_hash"),
    toAddress: text("to_address"),
    fromAddress: text("from_address"),
    value: text("value"),
    calldata: text("calldata"),
    uniswapRequestId: text("uniswap_request_id"),
    uniswapOrderId: text("uniswap_order_id"),
    uniswapPlanId: text("uniswap_plan_id"),
    uniswapSwapId: text("uniswap_swap_id"),
    stepIndex: integer("step_index"),
    requestPayload: jsonb("request_payload"),
    responsePayload: jsonb("response_payload"),
    error: text("error"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("transactions_user_created").on(t.userId, t.createdAt),
    index("transactions_tx_hash").on(t.txHash),
    index("transactions_order_id").on(t.uniswapOrderId),
    index("transactions_plan_id").on(t.uniswapPlanId),
    index("transactions_status").on(t.status),
  ],
);

/** Autonomous / watch missions driven by market signals. */
export const missions = pgTable(
  "missions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    strategy: text("strategy").notNull(),
    status: text("status").notNull().default("draft"),
    params: jsonb("params").notNull().default({}),
    guardrails: jsonb("guardrails").notNull().default({}),
    cursor: text("cursor"),
    lastError: text("last_error"),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("missions_user_status").on(t.userId, t.status),
    index("missions_strategy").on(t.strategy),
  ],
);

export type User = typeof users.$inferSelect;
export type Mission = typeof missions.$inferSelect;
