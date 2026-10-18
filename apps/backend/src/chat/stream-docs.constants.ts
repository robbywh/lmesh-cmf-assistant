/** Shared Swagger description of the SSE streaming endpoints. */
export const STREAM_DESCRIPTION = `Server-sent events. Each frame is \`event: <type>\\ndata: <json>\\n\\n\`:
- \`message.created\` { userMessage, assistantMessage } (first)
- \`token\` { messageId, delta } (zero or more)
- \`done\` { message } (last on success) or \`error\` { messageId, code, message } (last on failure)
Heartbeat comments (\`: ping\`) are sent every 15 s. If the client disconnects the reply is saved as aborted. Errors before the first byte are normal JSON error envelopes.`;
