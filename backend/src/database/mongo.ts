import mongoose from 'mongoose'

export async function connectMongo(uri: string, dbName: string): Promise<void> {
  await mongoose.connect(uri, { dbName })
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect()
}

export function mongoConnectionState(): string {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting']
  return states[mongoose.connection.readyState] ?? 'unknown'
}
