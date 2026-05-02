import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.dolf7_project_db_PRISMA_DATABASE_URL ?? process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString: connectionString! });

let prisma: PrismaClient;

const createPrisma = () => new PrismaClient({ adapter });

if (process.env.NODE_ENV === 'production') {
  prisma = createPrisma();
} else {
  if (!(global as any).prisma) {
    (global as any).prisma = createPrisma();
  }
  prisma = (global as any).prisma;
}

export default prisma;
