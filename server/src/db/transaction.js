// One SQL Server transaction around a unit of work (the original's SqlTransaction blocks).
import sql from 'mssql';
import { getPool } from './connection.js';

/** Runs fn(tx) inside one transaction; rolls back on any error. Pass tx to query / scalar / execute. */
export async function transaction(fn) {
  const tx = new sql.Transaction(await getPool());
  await tx.begin();
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (e) {
    await tx.rollback().catch(() => {}); // SQL Server may have rolled back already ("Transaction has been aborted"): keep the real error
    throw e;
  }
}
