import { Global, Module } from "@nestjs/common";

import { PrismaService } from "./prisma.service";

/** Exposes the shared `PrismaService` to every feature module. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
