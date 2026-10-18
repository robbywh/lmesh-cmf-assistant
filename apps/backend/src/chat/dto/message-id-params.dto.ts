import { MessageIdParamsSchema } from "@lmesh/api-contract";
import { createZodDto } from "nestjs-zod";

export class MessageIdParamsDto extends createZodDto(MessageIdParamsSchema) {}
