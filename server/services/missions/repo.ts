import { and, desc, eq } from "drizzle-orm"
import { db } from "@/server/services/db/client"
import { missions, users } from "@/server/services/db/schema"
import type {
  MissionGuardrails,
  MissionParams,
  MissionStatus,
  MissionStrategy,
} from "./types"

export async function createMission(input: {
  userId: string
  conversationId?: string | null
  strategy: MissionStrategy
  params?: MissionParams
  guardrails?: MissionGuardrails
  status?: MissionStatus
}) {
  const [row] = await db
    .insert(missions)
    .values({
      userId: input.userId,
      conversationId: input.conversationId ?? null,
      strategy: input.strategy,
      params: input.params ?? {},
      guardrails: input.guardrails ?? {},
      status: input.status ?? "draft",
    })
    .returning()
  return row
}

export async function updateMission(
  id: string,
  userId: string,
  patch: Partial<{
    status: MissionStatus
    params: MissionParams
    guardrails: MissionGuardrails
    cursor: string | null
    lastError: string | null
    lastActivityAt: Date | null
  }>
) {
  const [row] = await db
    .update(missions)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(missions.id, id), eq(missions.userId, userId)))
    .returning()
  return row
}

export async function getMission(id: string, userId: string) {
  return db.query.missions.findFirst({
    where: and(eq(missions.id, id), eq(missions.userId, userId)),
  })
}

export async function listMissionsForUser(userId: string, limit = 20) {
  return db.query.missions.findMany({
    where: eq(missions.userId, userId),
    orderBy: [desc(missions.updatedAt)],
    limit,
  })
}

export async function listRunningMissions() {
  return db.query.missions.findMany({
    where: eq(missions.status, "running"),
  })
}

export async function isKillSwitchOn(userId: string): Promise<boolean> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  })
  return Boolean(user?.agentKillSwitch)
}

export async function setKillSwitch(userId: string, on: boolean) {
  const [row] = await db
    .update(users)
    .set({ agentKillSwitch: on, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning()
  return row
}
