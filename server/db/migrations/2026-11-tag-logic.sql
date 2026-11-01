/* Asset and green tags by Serial Generation Logic (WIP Capture's FG label stage; server/src/modules/production/tag-check.js).
   Review before running; run on the TEST database first.
   Non-destructive: two new columns that allow NULL, added when missing; nothing else is changed. They allow NULL so the
   original app, which inserts with every column of the table, keeps working on the same database.

   SerialGenerationLogicHeader.UseFor: 1 the logic checks a scanned tag; 0 or NULL it generates (as every logic before this).
   Material.GreenTagLogic: the green tag's logic (a SerialCode); 0 or NULL no green tag. */
IF COL_LENGTH('dbo.SerialGenerationLogicHeader', 'UseFor') IS NULL
  ALTER TABLE dbo.SerialGenerationLogicHeader ADD UseFor int NULL;
GO
IF COL_LENGTH('dbo.Material', 'GreenTagLogic') IS NULL
  ALTER TABLE dbo.Material ADD GreenTagLogic int NULL;
GO
