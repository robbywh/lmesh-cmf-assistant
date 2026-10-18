import { SendMessageRequestSchema } from "@lmesh/api-contract";
import { createZodDto } from "nestjs-zod";

export class SendMessageDto extends createZodDto(SendMessageRequestSchema) {}
