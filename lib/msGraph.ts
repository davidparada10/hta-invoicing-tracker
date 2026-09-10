// App-only (client credentials) Microsoft Graph mail sender — no signed-in
// user, so the Azure app registration needs the Mail.Send *application*
// permission with admin consent, and MS_GRAPH_SENDER_EMAIL must be a real
// mailbox that app is allowed to send as.

interface GraphTokenResponse {
  access_token: string;
}

async function getGraphAccessToken(): Promise<string> {
  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "Missing MS_GRAPH_TENANT_ID / MS_GRAPH_CLIENT_ID / MS_GRAPH_CLIENT_SECRET env vars."
    );
  }

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) {
    throw new Error(`Graph token request failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as GraphTokenResponse;
  return data.access_token;
}

export async function sendGraphMail({
  to,
  subject,
  html,
}: {
  to: string[];
  subject: string;
  html: string;
}): Promise<void> {
  const sender = process.env.MS_GRAPH_SENDER_EMAIL;
  if (!sender) throw new Error("Missing MS_GRAPH_SENDER_EMAIL env var.");
  if (to.length === 0) throw new Error("No recipients provided.");

  const token = await getGraphAccessToken();

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: html },
          toRecipients: to.map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems: false,
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Graph sendMail failed: ${res.status} ${await res.text()}`);
  }
}
