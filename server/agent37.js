/**
 * Agent37 server-side adapter.
 *
 * Agent37 Personal is a hosted-agent product. An instance ID alone is not an
 * authenticated chat API. Configure AGENT37_BRIDGE_URL only when you have a
 * documented, supported endpoint/bridge and know its request contract.
 * Never expose bridge tokens or agent credentials to the browser.
 */
export function agent37Status() {
  const configured = Boolean(process.env.AGENT37_BRIDGE_URL && process.env.AGENT37_INSTANCE_ID);
  return {
    configured,
    provider: 'Agent37',
    message: configured
      ? 'Agent37 bridge settings are present. Verify the endpoint contract before production use.'
      : 'Agent37 is not connected yet. Built-in workspace commands remain available; no fake AI response will be shown.'
  };
}

export async function askAgent37({ message, user, context }) {
  const url = process.env.AGENT37_BRIDGE_URL;
  const instanceId = process.env.AGENT37_INSTANCE_ID;
  if (!url || !instanceId) return { connected: false, reply: null };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.AGENT37_BRIDGE_TOKEN
          ? { authorization: `Bearer ${process.env.AGENT37_BRIDGE_TOKEN}` }
          : {})
      },
      body: JSON.stringify({
        instanceId,
        message,
        user: { uid: user.uid, displayName: user.displayName || '' },
        context,
        safety: {
          requireConfirmationForMutations: true,
          allowedActions: ['navigate', 'update_profile', 'create_source', 'create_review', 'request_review_change'],
          prohibitArbitraryCodeExecution: true
        }
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Agent37 bridge returned ${response.status}: ${body.slice(0, 300)}`);
    }
    const data = await response.json();
    // The bridge response is deliberately treated as untrusted. This adapter
    // accepts text only; UI actions are created by the local allowlisted router.
    const reply = typeof data.reply === 'string' ? data.reply :
      typeof data.message === 'string' ? data.message : null;
    return { connected: true, reply };
  } finally {
    clearTimeout(timeout);
  }
}
