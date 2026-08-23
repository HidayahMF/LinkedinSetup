import { Types, type FilterQuery, type UpdateQuery } from 'mongoose'
import { ProfileFactModel, type ProfileFactDocument } from './profileFact.model.js'
import type { FactCategory, FactSource, FactStatus, FactType } from './profileFact.types.js'

export interface OwnedFactFilter {
  type?: FactType
  category?: FactCategory
  status?: FactStatus
}

export interface ProfileFactCreateData {
  userId: string
  type: FactType
  category: FactCategory
  key: string
  value: unknown
  status: FactStatus
  source: FactSource
  sourceReference?: string | null
}

function toObjectId(userId: string): Types.ObjectId {
  return new Types.ObjectId(userId)
}

export async function insertForOwner(
  data: ProfileFactCreateData,
): Promise<ProfileFactDocument> {
  return ProfileFactModel.create({
    ...data,
    userId: toObjectId(data.userId),
  })
}

export async function findManyByOwner(
  userId: string,
  filter: OwnedFactFilter = {},
  limit = 50,
): Promise<ProfileFactDocument[]> {
  const query: FilterQuery<ProfileFactDocument> = { userId: toObjectId(userId) }
  if (filter.type) query.type = filter.type
  if (filter.category) query.category = filter.category
  if (filter.status) query.status = filter.status
  return ProfileFactModel.find(query).sort({ updatedAt: -1 }).limit(limit).exec()
}

export async function findOneByOwner(
  userId: string,
  factId: string,
): Promise<ProfileFactDocument | null> {
  return ProfileFactModel.findOne({ _id: factId, userId: toObjectId(userId) }).exec()
}

export async function updateOneByOwner(
  userId: string,
  factId: string,
  patch: UpdateQuery<ProfileFactDocument>,
): Promise<ProfileFactDocument | null> {
  return ProfileFactModel.findOneAndUpdate({ _id: factId, userId: toObjectId(userId) }, patch, {
    new: true,
    runValidators: true,
  }).exec()
}

export async function deleteOneByOwner(userId: string, factId: string): Promise<boolean> {
  const result = await ProfileFactModel.deleteOne({
    _id: factId,
    userId: toObjectId(userId),
  }).exec()
  return result.deletedCount > 0
}
