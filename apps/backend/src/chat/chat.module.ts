import { Module } from "@nestjs/common";

import { AiModule } from "../ai/ai.module";
import { ConversationsModule } from "../conversations/conversations.module";
import { ChatStreamService } from "./chat-stream.service";
import { MessagesController } from "./messages.controller";
import { RetryController } from "./retry.controller";
import { SummariesController } from "./summaries.controller";

@Module({
  imports: [AiModule, ConversationsModule],
  controllers: [MessagesController, SummariesController, RetryController],
  providers: [ChatStreamService],
  exports: [ChatStreamService],
})
export class ChatModule {}
