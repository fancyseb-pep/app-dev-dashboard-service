// src/services/databricks.js
import { DBSQLClient } from "@databricks/sql";

let _client = null;
let _session = null;
let _connecting = false;

async function getSession() {
  if (_session) return _session;
  if (_connecting) {
    // Wait for a short interval for another concurrent initializer
    await new Promise((r) => setTimeout(r, 200));
    if (_session) return _session;
  }

  _connecting = true;
  try {
    _client = new DBSQLClient();

    await _client.connect({
      host: process.env.DATABRICKS_HOST,
      path: process.env.DATABRICKS_HTTP_PATH,
      token: process.env.DATABRICKS_TOKEN,
    });

    _session = await _client.openSession();
    console.log("[databricks] Session opened");
    return _session;
  } catch (err) {
    console.error("[databricks] Failed to open session:", err.message || err);
    // Clean up partial state so future calls can retry
    try {
      if (_session && typeof _session.close === "function") await _session.close();
    } catch (_) {}
    try {
      if (_client && typeof _client.close === "function") await _client.close();
    } catch (_) {}
    _session = null;
    _client = null;
    throw err;
  } finally {
    _connecting = false;
  }
}

/**
 * Close session and client (used for graceful shutdown).
 */
export async function closeSession() {
  try {
    if (_session && typeof _session.close === "function") {
      await _session.close();
      console.log("[databricks] Session closed");
    }
  } catch (e) {
    console.warn("[databricks] Error closing session:", e.message || e);
  }
  try {
    if (_client && typeof _client.close === "function") {
      await _client.close();
      console.log("[databricks] Client closed");
    }
  } catch (e) {
    console.warn("[databricks] Error closing client:", e.message || e);
  }
  _session = null;
  _client = null;
}

/**
 * Run a SQL query and return rows as plain JS objects.
 * Includes a single retry on session-level failures to improve resilience.
 */
export async function queryDatabricks(sql) {
  // Internal helper to execute against the current session
  async function exec() {
    const session = await getSession();
    const operation = await session.executeStatement(sql, {
      runAsync: true,
      maxRows: 10000,
    });

    try {
      const result = await operation.fetchAll();
      return result;
    } finally {
      try {
        await operation.close();
      } catch (e) {
        // best-effort
      }
    }
  }

  try {
    return await exec();
  } catch (err) {
    // If the session appears invalid, clear and retry once
    console.warn("[databricks] Query failed — will attempt one reconnect: ", err.message || err);
    _session = null;
    _client = null;
    try {
      return await exec();
    } catch (err2) {
      console.error("[databricks] Query failed after reconnect:", err2.message || err2);
      throw err2;
    }
  }
}
