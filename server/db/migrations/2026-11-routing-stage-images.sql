/* Routing stage images: which of the material's images (Material screen, "Artwork & Packing Images") WIP Capture shows
   at a stage of a routing (Routing screen, "Images on WIP Capture"; server/src/modules/masters/routing-stage-images.js).
   Review before running; run on the TEST database first.
   Non-destructive: a new table only, created when it does not exist; nothing else is changed.

   One row per routing and process that shows an image; a stage with no row shows none. */
IF OBJECT_ID('dbo.RoutingStageImages', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.RoutingStageImages (
    RouteCode    int          NOT NULL,
    ProcessCode  int          NOT NULL,
    ImageKind    varchar(20)  NOT NULL,
    UpdatedOn    datetime     NOT NULL CONSTRAINT DF_RoutingStageImages_UpdatedOn DEFAULT (GETDATE()),
    UpdatedBy    int          NOT NULL,
    CONSTRAINT PK_RoutingStageImages PRIMARY KEY (RouteCode, ProcessCode),
    CONSTRAINT CK_RoutingStageImages_Kind CHECK (ImageKind IN ('artwork', 'unitframe', 'basket'))
  );
  PRINT 'RoutingStageImages created.';
END
ELSE
  PRINT 'RoutingStageImages already exists: nothing to do.';
GO
