import { eq, desc, and, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export type DbClient = NodePgDatabase<typeof schema>;

// ===== Workflows =====

export async function createWorkflow(db: DbClient, data: typeof schema.workflows.$inferInsert) {
  const [row] = await db.insert(schema.workflows).values(data).returning();
  return row!;
}

export async function getWorkflow(db: DbClient, id: string) {
  const [row] = await db.select().from(schema.workflows).where(eq(schema.workflows.id, id));
  return row ?? null;
}

export async function listWorkflows(db: DbClient, limit = 20, offset = 0) {
  return db.select().from(schema.workflows)
    .orderBy(desc(schema.workflows.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function updateWorkflowStatus(
  db: DbClient,
  id: string,
  status: typeof schema.workflowStatusEnum.enumValues[number],
  updates?: { currentStep?: string; error?: string },
) {
  const values: Record<string, unknown> = { status, updatedAt: new Date() };
  if (updates?.currentStep) values.currentStep = updates.currentStep;
  if (updates?.error !== undefined) values.error = updates.error;
  const [row] = await db.update(schema.workflows)
    .set(values)
    .where(eq(schema.workflows.id, id))
    .returning();
  return row!;
}

// ===== Analysis Results =====

export async function insertAnalysis(db: DbClient, data: typeof schema.analysisResults.$inferInsert) {
  const [row] = await db.insert(schema.analysisResults).values(data).returning();
  return row!;
}

export async function getAnalysisByWorkflow(db: DbClient, workflowId: string) {
  const [row] = await db.select().from(schema.analysisResults)
    .where(eq(schema.analysisResults.workflowId, workflowId));
  return row ?? null;
}

// ===== Scripts =====

export async function insertScript(db: DbClient, data: typeof schema.scripts.$inferInsert) {
  const [row] = await db.insert(schema.scripts).values(data).returning();
  return row!;
}

export async function getScriptByWorkflow(db: DbClient, workflowId: string) {
  const [row] = await db.select().from(schema.scripts)
    .where(eq(schema.scripts.workflowId, workflowId));
  return row ?? null;
}

// ===== Media Assets =====

export async function insertMediaAsset(db: DbClient, data: typeof schema.mediaAssets.$inferInsert) {
  const [row] = await db.insert(schema.mediaAssets).values(data).returning();
  return row!;
}

export async function listMediaAssets(db: DbClient, workflowId: string) {
  return db.select().from(schema.mediaAssets)
    .where(eq(schema.mediaAssets.workflowId, workflowId));
}

// ===== Render Outputs =====

export async function insertRenderOutput(db: DbClient, data: typeof schema.renderOutputs.$inferInsert) {
  const [row] = await db.insert(schema.renderOutputs).values(data).returning();
  return row!;
}

export async function getRenderByWorkflow(db: DbClient, workflowId: string) {
  const [row] = await db.select().from(schema.renderOutputs)
    .where(eq(schema.renderOutputs.workflowId, workflowId));
  return row ?? null;
}
