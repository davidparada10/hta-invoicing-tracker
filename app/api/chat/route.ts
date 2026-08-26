import { createAgentUIStreamResponse } from "ai";
import { htaAgent } from "@/lib/agents/hta-agent";

export const maxDuration = 30;

export async function POST(request: Request) {
  const { messages } = await request.json();

  return createAgentUIStreamResponse({
    agent: htaAgent,
    uiMessages: messages,
  });
}
