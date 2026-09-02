import { createAgentUIStreamResponse } from "ai";
import { htaAgent } from "@/lib/agents/hta-agent";
import { getClientIp } from "@/lib/auth/rateLimit";
import { checkChatRateLimit } from "@/lib/auth/chatRateLimit";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const { limited, retryAfterSeconds } = await checkChatRateLimit(ip);
    if (limited) {
      return Response.json(
        { error: "Too many messages. Please wait a moment and try again." },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds ?? 60) } }
      );
    }

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
