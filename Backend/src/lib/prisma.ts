import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../generated/prisma/client.ts';
import { config } from './config.ts';

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: config.databaseUrl }),
});

export type Database = typeof prisma;

/** Either the client or an open transaction, so a service can join a larger unit of work. */
export type Db = Database | Prisma.TransactionClient;

export const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 };
