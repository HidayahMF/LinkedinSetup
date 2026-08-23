import mongoose from 'mongoose'
import { AuditEventModel, type AuditActionType } from './audit.model.js'

export interface AuditEventInput {
  userId: string
  actionType: AuditActionType
  entityType: string
  entityId: string
  before?: unknown
  after?: unknown
}

export async function appendAuditEvent(entry: AuditEventInput): Promise<void> {
  await AuditEventModel.create({
    userId: new mongoose.Types.ObjectId(entry.userId),
    actionType: entry.actionType,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    timestamp: new Date(),
  })
}
