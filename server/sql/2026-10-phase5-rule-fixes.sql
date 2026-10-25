/* Phase 5 rule fixes: database part. Review before running; run on the TEST database first.
   Non-destructive: nothing is dropped and no existing data is deleted. Each part can be run on its own.

   Part 1  index on MaterialBarcode(Serial)  (every scan looks a unit up by Serial)
   Part 2  PRODHeader.AssignedQty backfill   (the app now maintains it on each assignment; this fills the history)
*/

/* ---- Part 1: MaterialBarcode(Serial) index ------------------------------------------------------------------------
   Created only when no index already starts with Serial. On Garuda_WRL_TEST this is a no-op: IX_MaterialBarcode
   (unique, Serial) exists there. Online build (no table lock) on Enterprise / Developer editions; on other editions
   the build locks MaterialBarcode (about 9.6 million rows on TEST) while it runs, so run it outside production hours. */
IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes i
  JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.key_ordinal = 1
  JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
  WHERE i.object_id = OBJECT_ID('dbo.MaterialBarcode') AND c.name = 'Serial'
)
BEGIN
  DECLARE @online nvarchar(20) =
    CASE WHEN CAST(SERVERPROPERTY('EngineEdition') AS int) = 3 THEN N'ONLINE = ON' ELSE N'ONLINE = OFF' END;
  DECLARE @sql nvarchar(400) =
    N'CREATE NONCLUSTERED INDEX IX_MaterialBarcode_Serial ON dbo.MaterialBarcode (Serial) WITH (' + @online + N', SORT_IN_TEMPDB = ON);';
  PRINT @sql;
  EXEC sp_executesql @sql;
END
ELSE
  PRINT 'MaterialBarcode(Serial) is already indexed: nothing to do.';
GO

/* ---- Part 2: PRODHeader.AssignedQty backfill -------------------------------------------------------------------------
   AssignedQty = the quantity of the order's job cards (ProcessOrder.PRODNo). Only rows where it differs are changed.
   Step A previews; step B updates in one transaction and shows the count. Orders whose job cards exceed the order
   quantity keep the real figure (they then no longer appear in Production Assignment's order list). */

-- Step A: preview
SELECT h.PRODNo, h.Qty, ISNULL(h.AssignedQty, 0) AS AssignedQtyNow, jc.JobCardQty AS AssignedQtyNew, h.Status
FROM dbo.PRODHeader h
CROSS APPLY (SELECT SUM(p.Qty) AS JobCardQty FROM dbo.ProcessOrder p WHERE p.PRODNo = h.PRODNo) jc
WHERE jc.JobCardQty IS NOT NULL AND ISNULL(h.AssignedQty, 0) <> jc.JobCardQty
ORDER BY h.PRODNo DESC;
GO

-- Step B: update (remove the comment marks to run)
/*
BEGIN TRANSACTION;
UPDATE h SET AssignedQty = jc.JobCardQty
FROM dbo.PRODHeader h
CROSS APPLY (SELECT SUM(p.Qty) AS JobCardQty FROM dbo.ProcessOrder p WHERE p.PRODNo = h.PRODNo) jc
WHERE jc.JobCardQty IS NOT NULL AND ISNULL(h.AssignedQty, 0) <> jc.JobCardQty;
SELECT @@ROWCOUNT AS OrdersUpdated;
COMMIT TRANSACTION;
*/
