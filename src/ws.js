const { WebSocketServer } = require('ws');

/**
 * Set up WebSocket server attached to an HTTP server.
 * Clients connect to ws://host/ws with their session cookie.
 * Messages are JSON: { type: 'meal_updated' | 'poll_created' | 'poll_closed', data: {...} }
 */
function setupWebSocket(server, db) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Map: householdId -> Set<ws>
  const householdClients = new Map();

  wss.on('connection', (ws, req) => {
    // Parse session from cookie
    const cookieHeader = req.headers.cookie || '';
    const match = cookieHeader.match(/mf_sid=([^;]+)/);
    if (!match) {
      ws.close(4001, 'No session');
      return;
    }

    const session = db.prepare(
      "SELECT s.user_id, u.household_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.sid = ? AND s.expires_at > datetime('now')"
    ).get(match[1]);

    if (!session) {
      ws.close(4001, 'Invalid session');
      return;
    }

    ws.userId = session.user_id;
    ws.householdId = session.household_id;

    if (session.household_id) {
      if (!householdClients.has(session.household_id)) {
        householdClients.set(session.household_id, new Set());
      }
      householdClients.get(session.household_id).add(ws);
    }

    ws.on('close', () => {
      if (ws.householdId && householdClients.has(ws.householdId)) {
        householdClients.get(ws.householdId).delete(ws);
        if (householdClients.get(ws.householdId).size === 0) {
          householdClients.delete(ws.householdId);
        }
      }
    });

    ws.on('error', () => {});
  });

  /**
   * Broadcast a message to all connected clients in a household.
   * @param {number} householdId
   * @param {string} type - 'meal_updated' | 'poll_created' | 'poll_closed'
   * @param {object} data
   */
  function broadcast(householdId, type, data) {
    if (!householdId) return;
    const clients = householdClients.get(householdId);
    if (!clients) return;

    const message = JSON.stringify({ type, data });
    for (const client of clients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    }
  }

  return { wss, broadcast };
}

module.exports = { setupWebSocket };
