import { PrismaPg } from '@prisma/adapter-pg';
import { config } from './config.ts';
import { PrismaClient, type Prisma } from './generated/prisma/client.ts';

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: config.databaseUrl }),
});

/** Either the client or an open transaction, so a service can join a larger unit of work. */
export type Db = typeof prisma | Prisma.TransactionClient;

export function audit(
  db: Db,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  detail?: Prisma.InputJsonValue,
) {
  return db.auditEvent.create({ data: { actorId, action, entityType, entityId, detail } });
}
