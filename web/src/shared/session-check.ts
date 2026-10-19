/**
 * Whether the signed-in account may have changed since the gateway last confirmed it. Another tab
 * can sign in or out at any time; this tab learns of it only by reading /gw/me again. Until that read
 * succeeds, permission-dependent controls render as unavailable.
 */
let unconfirmed = false;
const listeners = new Set<() => void>();
function set(value: boolean) {
  if (unconfirmed === value) return;
  unconfirmed = value;
  for (const listener of listeners) listener();
}
export const sessionUnconfirmed = () => unconfirmed;
export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
/** A successful /gw/me read confirms the account. */
export const confirmSession = () => set(false);

/** Same-origin tabs announce sign-in and sign-out to each other. Without a channel, tabs still re-read on focus. */
const CHANNEL = "multiagency-session";
export function announceSessionChange() {
  try { const channel = new BroadcastChannel(CHANNEL); channel.postMessage("changed"); channel.close(); } catch { /* No channel: focus and visibility still re-read. */ }
}

/** Re-reads the session whenever it may have changed: the tab becomes visible or focused, or another tab signs in or out. */
export function watchSession(recheck: () => void) {
  const changed = () => { set(true); recheck(); };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") changed(); });
  window.addEventListener("focus", changed);
  try { new BroadcastChannel(CHANNEL).addEventListener("message", changed); } catch { /* No channel: focus and visibility still re-read. */ }
}
