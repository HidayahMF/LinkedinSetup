import { Types, type UpdateQuery } from 'mongoose'
import { ProfileModel, snapshotToMongo, type ProfileDocument } from './profile.model.js'
import type { ProfileSnapshot } from './profile.types.js'

function toObjectId(userId: string): Types.ObjectId {
  return new Types.ObjectId(userId)
}

export async function findOneByOwner(userId: string): Promise<ProfileDocument | null> {
  return ProfileModel.findOne({ userId: toObjectId(userId) }).exec()
}

export async function createForOwner(
  userId: string,
  snapshot: ProfileSnapshot,
): Promise<ProfileDocument> {
  return ProfileModel.create({ userId: toObjectId(userId), ...snapshotToMongo(snapshot) })
}

export async function updateSectionsByOwner(
  userId: string,
  patch: UpdateQuery<ProfileDocument>,
): Promise<ProfileDocument | null> {
  return ProfileModel.findOneAndUpdate({ userId: toObjectId(userId) }, patch, {
    new: true,
    upsert: false,
    runValidators: true,
  }).exec()
}

export async function readSnapshotByOwner(userId: string): Promise<ProfileSnapshot | null> {
  const doc = await findOneByOwner(userId)
  if (!doc) return null
  return docToSnapshot(doc)
}

export function docToSnapshot(doc: ProfileDocument): ProfileSnapshot {
  return {
    headline: doc.headline ?? '',
    about: doc.about ?? '',
    experiences: (doc.experiences ?? []) as ProfileSnapshot['experiences'],
    educations: (doc.educations ?? []) as ProfileSnapshot['educations'],
    projects: (doc.projects ?? []) as ProfileSnapshot['projects'],
    skills: (doc.skills ?? []) as ProfileSnapshot['skills'],
    certifications: (doc.certifications ?? []) as ProfileSnapshot['certifications'],
    featured: (doc.featured ?? []) as ProfileSnapshot['featured'],
  }
}
