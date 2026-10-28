/* Material images: the artwork, unit frame and basket images of a material (the Material screen's "Images" step,
   server/src/modules/masters/material-images.js). Review before running; run on the TEST database first.
   Non-destructive: a new table only, created when it does not exist; nothing else is changed.

   One row per material and kind ('artwork' | 'unitframe' | 'basket'); Image holds the file as uploaded. */
IF OBJECT_ID('dbo.MaterialImages', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.MaterialImages (
    MatCode    int            NOT NULL,
    Kind       varchar(20)    NOT NULL,
    Image      varbinary(max) NOT NULL,
    FileName   nvarchar(260)  NOT NULL,
    MimeType   varchar(50)    NOT NULL,
    UpdatedOn  datetime       NOT NULL CONSTRAINT DF_MaterialImages_UpdatedOn DEFAULT (GETDATE()),
    UpdatedBy  int            NOT NULL,
    CONSTRAINT PK_MaterialImages PRIMARY KEY (MatCode, Kind),
    CONSTRAINT CK_MaterialImages_Kind CHECK (Kind IN ('artwork', 'unitframe', 'basket'))
  );
  PRINT 'MaterialImages created.';
END
ELSE
  PRINT 'MaterialImages already exists: nothing to do.';
GO
