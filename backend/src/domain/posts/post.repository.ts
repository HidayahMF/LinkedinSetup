import { Types } from 'mongoose'
import { ApiError } from '../../errors/apiError.js'
import { PostModel, type PostDocument } from './post.model.js'

function toObjectId(userId: string): Types.ObjectId {
  return new Types.ObjectId(userId)
}

export async function insertForOwner(data: {
  userId: string
  title?: string | null
  text: string
}): Promise<PostDocument> {
  return PostModel.create({ ...data, userId: toObjectId(data.userId) })
}

export async function findManyByOwner(
  userId: string,
): Promise<PostDocument[]> {
  return PostModel.find({ userId: toObjectId(userId) }).sort({ updatedAt: -1 }).limit(100).exec()
}

export async function findOneByOwner(userId: string, postId: string): Promise<PostDocument | null> {
  try {
    return await PostModel.findOne({ _id: postId, userId: toObjectId(userId) }).exec()
  } catch {
    return null
  }
}

export async function requireOneByOwner(userId: string, postId: string): Promise<PostDocument> {
  const doc = await findOneByOwner(userId, postId)
  if (!doc) throw ApiError.notFound('Post not found')
  return doc
}

export async function updateByOwner(
  userId: string,
  postId: string,
  patch: Record<string, unknown>,
): Promise<PostDocument> {
  const doc = await PostModel.findOneAndUpdate(
    { _id: postId, userId: toObjectId(userId) },
    { $set: patch },
    { new: true },
  ).exec()
  if (!doc) throw ApiError.notFound('Post not found')
  return doc
}
