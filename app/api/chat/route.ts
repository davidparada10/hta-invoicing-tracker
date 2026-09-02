import { createAgentUIStreamResponse } from "ai";
import { htaAgent } from "@/lib/agents/hta-agent";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

    return createAgentUIStreamResponse({
      agent: htaAgent,
      uiMessages: messages,
    });
  } catch (err) {
    console.error("api/chat error:", err);
    return Response.json(
      { error: "Could not process that message. Please try again." },
      { status: 500 }
    );
  }
}
