import { Module } from "@nestjs/common";

import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";
import { StaleStreamService } from "./stale-stream.service";

@Module({
  controllers: [ConversationsController],
  providers: [ConversationsService, StaleStreamService],
  exports: [StaleStreamService],
})
export class ConversationsModule {}
