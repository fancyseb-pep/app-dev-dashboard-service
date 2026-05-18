// src/services/databricks.js
import { DBSQLClient } from "@databricks/sql";

let _client = null;
let _session = null;

async function getSession() {
  if (_session) return _session;

  _client = new DBSQLClient();

  await _client.connect({
    host: process.env.DATABRICKS_HOST,
    path: process.env.DATABRICKS_HTTP_PATH,
    token: process.env.DATABRICKS_TOKEN,
  });

  _session = await _client.openSession();
  console.log("[databricks] Session opened");
  return _session;
}

/**
 * Run a SQL query and return rows as plain JS objects.
 * @param {string} sql
 * @returns {Promise<object[]>}
 */
export async function queryDatabricks(sql) {
  const session = await getSession();
  const operation = await session.executeStatement(sql, {
    runAsync: true,
    maxRows: 10000,
  });

  const result = await operation.fetchAll();
  await operation.close();
  return result;
}
