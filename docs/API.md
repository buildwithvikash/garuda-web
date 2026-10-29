# Garuda WRL API

All under `/api`, JSON in and out. Every call except sign-in needs the session cookie (`POST /api/auth/login`);
a screen's calls also need the user's role to open that screen. Errors: `{ message }`, plus `errors` (field -> problem)
on 422. 400: the screen refused (its own message, as the original showed it); 401 not signed in; 403 no access; 404 no
such record / event; 500 `{ message }` with the request reference that is in the log.

## Sign-in — /api/auth

| Call | Does |
|---|---|
| `GET /login-page` | what the sign-in page shows (company, business units shown or not) |
| `GET /business-units` | the sign-in business unit list |
| `POST /login` | `{ userId, password, businessUnit }` -> the session cookie; the original's refusals (locked, expired, must change password ...) |
| `POST /change-password` | `{ userId, current, next }` |
| `POST /logout` | ends the session |
| `GET /me` | the signed-in user and their menu |

## Production orders — /api/production/orders

| Call | Does |
|---|---|
| `GET /?page=&column=&op=&value=` | a page of orders, optionally filtered on one column |
| `GET /search-fields`, `GET /search-fields/:column/values` | filterable columns, a column's values |
| `GET /new` | a blank order with its options |
| `POST /changes/:field` | `material` / `orderType` / `salesOrder` chosen: what changes |
| `POST /service-requests` | adds the picked service request as a line |
| `GET /:prodNo` · `POST /` · `PUT /:prodNo` · `DELETE /:prodNo` (`{ remark }`) | read, create, update, cancel |

## Production assignment — /api/production/assignments

| Call | Does |
|---|---|
| `GET /new` | the screen as it opens, with its lists |
| `POST /changes/:field` | `department` / `order` / `routing` / `process` / `station` chosen: what changes |
| `POST /print` | starts the order at its first stage and prints the job cards (only values the server offered) |

## Setup and quality screens — /api/masters/<name>, /api/quality/<name>

Each of these screens is a resource. The screen's own code runs underneath (parity-tested against the original); the
API only names its fields. A field is the column its control is bound to (camelCase); a grid, check list or tree is
named after its child table and holds the screen's own values (grid rows with their column names, the checked values);
a control with no column is named after its control ID. The QC panel (`qc`), the approval footer (`footer`), a
picked file and an image hold the screen's own structure: send them back as you got them, with the operator's input.

A refused save / update / delete answers 400 `{ message, alert? }` (alert: what the original page showed). The list
(`GET /`) works where the screen has one; on screens without a View button (Final Inspection, NCMR ...) it fails as
the original's list query does.

| Call | Does |
|---|---|
| `GET /?page=&column=&op=&value=` (`f.<name>=` a page's own list choices) | a page of records (1000 a request; `total` = all) |
| `GET /search-fields`, `GET /search-fields/:column/values` | filterable columns, a column's values |
| `GET /layout` | what a page draws the screen from (the same as `/api/forms/spec`), plus `api: { fields, names, events }` (field -> control, control -> API name, event -> control) |
| `GET /new` | `{ record, options, ui, viewState, events, printers, copyFrom }`: a blank record as the screen opens it |
| `GET /:key` · `GET /:key/copy` | a saved record (`status` / `statusMessage` when cancelled); Copy where the screen has it. `ui` holds every control (visible, enabled, readOnly, text, refilled) |
| `GET /pickers/:field?search=` | a search picker's rows |
| `POST /events/:event` | `{ record, viewState, ui, arg, index }` -> `{ record, options, ui, alert, viewState }`: what an option change or button does |
| `POST /` · `PUT /:key` · `DELETE /:key` (`{ remark, record? }`) | create (201, `{ key, message }`), update, cancel (status 200, not erased) |
| `POST /print` | `{ record, printer }`: the screen's print |

Send the whole `record` the API gave you back (with your changes), and the `viewState` of the last answer: the screen's
code works on the full form, as the original page did.

### Change Password — `/api/masters/change-password`

Original: `View/Authorization/ChangePasswordForm.aspx`. Fields: `buCode`, `tbUser`, `tbCurPass`, `tbNewPass`, `tbRetypePass`.

### Reset Password — `/api/masters/reset-password`

Original: `View/Authorization/ResetPasswordForm.aspx`. Fields: `buCode`, `ddlUser`, `tbNewPass`, `tbRetypePass`.

### User Roles — `/api/masters/user-roles`

Original: `View/Authorization/UserRoleForm.aspx`. Fields: `roleCode`, `status`, `roleName`, `expiryDays`, `userRoleForm`.

### User Master — `/api/masters/users`

Original: `View/Authorization/UsersForm.aspx`. Fields: `userCode`, `status`, `userID`, `userName`, `employee`, `erpEmployee`, `statrtOn`, `userRole`, `defaultForm`, `userBusinessUnits`, `userProcess`, `photo`, `cbAllProcess`.

Events: `cbAllProcess`.

### Business Unit — `/api/masters/business-units`

Original: `View/BusinessSetup/BusinessUnitForm.aspx`. Fields: `buCode`, `status`, `name`, `alias`, `buType`, `prefix`, `isVirtual`, `parentBu`, `controlIndicator`, `address1`, `address2`, `postalCode`, `city`, `state`, `country`, `email`, `contactNo`, `webSite`, `taxRegNo`, `licence`, `gS1Prefix`, `completeAddress`, `otherDetails`, `businessUnits`, `logo`, `treeView1`.

### Company — `/api/masters/company`

Original: `View/BusinessSetup/CompanyForm.aspx`. Fields: `code`, `companyName`, `licenceType`, `expiryBy`, `unqiueID`, `licenceID`, `logo`.

### Department — `/api/masters/departments`

Original: `View/BusinessSetup/DepartmentForm.aspx`. Fields: `deptCode`, `businessUnit`, `status`, `name`, `alias`, `deptType`, `prefix`, `controlIndicator`, `isVirtual`.

### Ledger Master — `/api/masters/ledgers`

Original: `View/BusinessSetup/LedgerForm.aspx`. Fields: `ledgerCode`, `department`, `businessUnit`, `status`, `ledgerGroup`, `controlIndicator`, `name`, `alias`, `prefix`, `webSite`.

### Bill of Material — `/api/masters/bills-of-material`

Original: `View/MaterialSetup/BillOfMaterial.aspx`. Fields: `bomCode`, `businessUnit`, `status`, `alias`, `version`, `remark`, `model`, `material`, `baseQty`, `baseUom`, `weight`, `weightUom`, `ddlProcess`, `ddlInputMaterialType`, `ddlInputMaterial`, `ddlInputUom`, `ddlRouting`, `bomInput`, `bomInputAltMaterial`, `dDlAltInputMaterial`, `gvCurrentAltMaterial`, `ddlOutoutMaterialType`, `ddlOutputMaterial`, `ddlOutputUom`, `bomOutput`, `tbInputQuantity`, `ddlInputScan`, `ddlOutputScan`, `tbOutputQty`.

Events: `material`, `ddlInputMaterialType`, `ddlOutoutMaterialType`, `ddlInputMaterial`, `ddlOutputMaterial`, `gvbomInputCancel`, `gvOutputCancel`, `btnInputAdd`, `btnOutputAdd`, `gvbomInputSelect`, `gvOutputSelect`, `gvbomInputDelete`, `gvOutputDelete`, `gvbomInputAlternativeMat`, `btnAltPanelClose`, `btnAddAltMaterial`, `btnUpdateAltMaterial`, `gvCurrentAltMaterialDelete`.

### Material Barcode — `/api/masters/material-barcodes`

Original: `View/MaterialSetup/MaterialBarcode.aspx`. Fields: `barcodeNo`, `createdOn`, `businessUnit`, `status`, `serial`, `tbReprint`, `department`, `area`, `storageCode`, `material`, `uom`, `docType`, `docNo`, `processCode`, `tbRemark`.

Events: `department`, `area`, `material`.

Print: yes.

### Material Category — `/api/masters/material-categories`

Original: `View/MaterialSetup/MaterialCategoryForm.aspx`. Fields: `categoryCode`, `status`, `name`, `alias`, `prefix`, `categoryType`, `tagCode`, `isInspectionReq`, `inspectionType`, `inspectionCheckList`, `certificateControl`.

Events: `isInspectionReq`.

### Material — `/api/masters/materials`

Original: `View/MaterialSetup/MaterialForm.aspx`. Fields: `matCode`, `status`, `type`, `category`, `model`, `ledger`, `name`, `altName`, `alias`, `baseUom`, `hsnCode`, `barcode`, `tagCode`, `sRetailRate`, `batch`, `supBatch`, `manDate`, `expiry`, `exipiryMonths`, `serial`, `assetTagType`, `track`, `trackNoType`, `isPacket`, `grossWeight`, `alterUOM`, `convVal`, `classification`, `isFIFO`, `fifoAge`, `reorderLevel`, `reorderQty`, `depreciationMethod`, `isInspectionReq`, `inspectionType`, `inspectionCheckList`, `retestIn`, `certificateControl`, `materialImage`, `purchaseTax`, `purchaseRate`, `purchaseUnit`, `pConvQty`, `salesTax`, `wholesaleRate`, `salesUnit`, `sConvQty`, `ddlGroup`, `ddlName`, `tbNewValue`, `materialVariant`, `ddlVendor`, `dDlSerialLogic`, `materialLedgerMap`, `route`, `ddlValue`, `tbVendorMat`.

Events: `baseUom`, `type`, `isInspectionReq`, `category`, `model`, `ddlName`, `ddlGroup`, `btnAdd`, `gvTransDataDelete`, `btnLedgerMap`, `gvLedgerCodeDelete`.

### Model — `/api/masters/models`

Original: `View/MaterialSetup/ModelForm.aspx`. Fields: `modelCode`, `status`, `name`, `alias`, `category`, `prefix`, `variant`, `ddlGroup`, `ddlName`, `tbNewValue`, `modelVariant`, `ddlValue`.

Events: `ddlName`, `ddlGroup`, `btnAdd`, `gvTransDataDelete`.

### Serial Generation Logic — `/api/masters/serial-logics`

Original: `View/MaterialSetup/SerialGenerationLogicForm.aspx`. Fields: `serialCode`, `status`, `name`, `alias`, `type`, `serialLength`, `ddlName`, `tbDescription`, `tbSeqNo`, `ddlSeperator`, `tbStartingNo`, `tbSeed`, `tbLenth`, `tbEndingNo`, `tbFormat`, `tbValue`, `serialGenerationLogicDetail`.

Events: `ddlName`, `type`, `btnAdd`, `gvTransDataSelect`, `gvTransDataCancel`, `gvTransDataDelete`.

### Unit of Measure — `/api/masters/units-of-measure`

Original: `View/MaterialSetup/UnitOfMeasureForm.aspx`. Fields: `uomCode`, `status`, `name`, `alias`, `uomType`.

### Variant Field — `/api/masters/variant-fields`

Original: `View/MaterialSetup/VariantFieldForm.aspx`. Fields: `fieldCode`, `status`, `name`.

### Variant Field Value — `/api/masters/variant-values`

Original: `View/MaterialSetup/VariantFieldValueForm.aspx`. Fields: `code`, `status`, `field`, `name`, `prefix`.

### Production Line — `/api/masters/production-lines`

Original: `View/ProductionSetup/ProductionLineForm.aspx`. Fields: `lineCode`, `businessUnit`, `status`, `department`, `name`, `alias`.

### Production Process — `/api/masters/production-processes`

Original: `View/ProductionSetup/ProductionProcess.aspx`. Fields: `processCode`, `status`, `name`, `alias`, `cost`, `unit`, `prodcutionStage`, `model`, `seq`, `prefix`, `tag`, `serialLogic`, `checkPoints`, `checkingMethod`, `showInHistory`.

### Routing — `/api/masters/routings`

Original: `View/ProductionSetup/RoutingForm.aspx`. Fields: `routeCode`, `status`, `name`, `alias`, `type`, `model`, `material`, `tbSeq`, `ddlProcess`, `tbProcessTime`, `tbSetupTime`, `tbMinHoldP`, `tbMaxHoldP`, `tbAutoProcess`, `ddlqcStatus`, `ddlConsession`, `ddlValidate`, `ddlWorkStation`, `ddlPallet`, `tbDrawaingNo`, `ddlCheckList`, `ddlInspection`, `ddlBatchFreq`, `ddlStageLabel`, `ddlNextStageLabel`, `tbNoOfCopy`, `routingTrans`, `routeInstruction`, `ddlGuideFileType`, `tbGuideDesc`, `ddlExistingGuide`, `routingGuide`, `ddlMaterialSeq`, `ddlStageQC`, `tbInstruction`, `fileUploadGuide`, `tbGuideFilePath`.

Events: `model`, `btnAdd`, `gvTransDataDelete`, `gvTransDataSelect`, `gvTransDataInstruction`, `gvTransDataGuide`, `imbInstructionClose`, `imbGuideClose`, `btnInstructionAdd`, `gvInstructionDelete`, `gvGuideDelete`, `ddlExistingGuide`, `ddlGuideFileType`, `btnGuideAdd`.

### Routing — `/api/masters/routing-guides`

Original: `View/ProductionSetup/RoutingGuideForm.aspx`. Fields: `routeCode`, `status`, `name`, `alias`, `model`, `material`, `routingTrans`, `routeInstruction`, `ddlGuideFileType`, `tbGuideDesc`, `ddlExistingGuide`, `routingGuide`, `tbInstruction`, `fileUploadGuide`, `tbGuideFilePath`.

Events: `model`, `gvTransDataInstruction`, `gvTransDataGuide`, `imbInstructionClose`, `imbGuideClose`, `btnInstructionAdd`, `gvInstructionDelete`, `gvGuideDelete`, `ddlExistingGuide`, `ddlGuideFileType`, `btnGuideAdd`.

### Work Center — `/api/masters/work-centers`

Original: `View/ProductionSetup/WorkCenterForm.aspx`. Fields: `stationCode`, `businessUnit`, `status`, `department`, `groupID`, `name`, `alias`, `tbCheckListSearch`, `workCenterProcesses`, `manfLine`, `cost`, `jobWork`.

### Defect Code Master — `/api/masters/defect-codes`

Original: `View/Settings/DefectCodeMasterForm.aspx`. Fields: `code`, `status`, `category`, `defectCategory`, `name`, `alias`, `process`.

### Employee — `/api/masters/employees`

Original: `View/Settings/EmployeeForm.aspx`. Fields: `empCode`, `businessUnit`, `status`, `name`, `alias`, `joinDate`, `empType`, `department`, `designation`, `gender`, `birthDate`, `married`, `anniversary`, `address1`, `address2`, `postalCode`, `city`, `state`, `country`, `email`, `mobileNo`, `altMobileNo`, `accessCardNo`, `allowAccess`.

Print: yes.

### Identification Tag Designs — `/api/masters/material-tags`

Original: `View/Settings/MaterialTagForm.aspx`. Fields: `tagCode`, `status`, `name`, `tagType`, `tagImage`, `prnCommand`.

### CheckList Master — `/api/masters/check-lists`

Original: `View/Settings/ParameterForm.aspx`. Fields: `parameterCode`, `status`, `name`, `alias`, `type`, `ddlUom`, `ddlList`, `ddlInstrument`, `uploadImage`, `parameterTran`, `tbName`, `tbDescription`, `ddlInputType`, `tbMinValue`, `tbMaxValue`, `tbPassValue`, `ddlResultDefined`.

Events: `ddlInputType`, `btnAdd`, `gvTransDataSelect`, `gvTransDataDelete`.

### Parameter Value List — `/api/masters/value-lists`

Original: `View/Settings/ParameterValueListForm.aspx`. Fields: `code`, `status`, `name`, `ddlPass`, `parameterListTran`, `tbValue`.

Events: `btnAdd`, `gvTransDataDelete`.

### Printer Master — `/api/masters/printers`

Original: `View/Settings/PrinterForm.aspx`. Fields: `rowID`, `businessUnit`, `status`, `department`, `area`, `station`, `name`, `ip`, `driver`.

### Rework Resolution Master — `/api/masters/rework-resolutions`

Original: `View/Settings/ReworkResolutionForm.aspx`. Fields: `id`, `status`, `type`.

### Root Cause Master — `/api/masters/root-causes`

Original: `View/Settings/RootCauseForm.aspx`. Fields: `id`, `status`, `type`.

### Material Scrap Reason Master — `/api/masters/scrap-reasons`

Original: `View/Settings/ScrapReasonForm.aspx`. Fields: `id`, `status`, `type`.

### Shift — `/api/masters/shifts`

Original: `View/Settings/ShiftMasterForm.aspx`. Fields: `shiftCode`, `businessUnit`, `status`, `department`, `name`, `startTime`, `endTime`, `breakPeriod`, `shiftBreaks`, `tbBreakName`, `tbStart`, `tbEnd`.

Events: `btnAdd`, `gvTransDataDelete`.

### Rework Confirmation — `/api/quality/rework-confirmations`

Original: `View/Quality/ReworkConfirmationNew.aspx`. Fields: `id`, `inspectedOn`, `userCode`, `inspectionLotNo`, `businessUnit`, `department`, `tbBarcode`, `sampleBarcode`, `gvInspectionDetails`, `gvProcess`, `status`, `ddlNextAction`, `gvSelfInspection`, `inspectionDefect`, `ddlRootCause`, `sslActionTaken`, `qty`, `uom`, `tbApproverRemark`, `ddlNewAction`, `gvReworkHistory`, `ddlApproverStatus`, `ddlPrinter`, `qc`.

Events: `department`, `ddlApproverStatus`, `go`, `btnUD`, `qcNext`, `qcPrev`, `qcSave`, `qcValue`, `qcList`, `qcGo`, `qcSelect`, `qcFail`, `qcPass`, `qcClose`.

### Production Capture — `/api/production/wip-capture`

Original: `View/Production/WIPCaptureForm.aspx`. Fields: `department`, `businessUnit`, `tbWorkStation`, `ddlStationPrinter`, `tbJobCoard`, `tbFG`, `gvHistory`, `gvComponents`, `ddlfgMaterial`, `ddlProdOrder`, `gvProcessingUnit`, `tbqcRemark`, `gvinMaterial`, `tbProcessingMachine`, `tbinhu`, `tbinItemCode`, `tbInQty`, `ddlINUom`, `tbSerialHU`, `tbSerialBarcode`, `gvMaterial`, `tbYieldMachinary`, `tbOutHU`, `ddlPackUom`, `packQty`, `noofPacks`, `tbWeighingScale`, `ddlWeightUnit`, `grossWeight`, `tareWeight`, `tbRejectBarcode`, `tbRejectQty`, `ddlRejectUOM`, `cBdefectCodes`, `tbRejectRemark`, `gvwqcMaterial`, `tbBarcode`, `sampleBarcode`, `tbQty`, `ddlUom`, `ddlwipqcStatus`, `ddlNextAction`, `ddlDefectCate`, `ddlDefectCodes`, `inspectionDefect`, `tbwqcRemark`, `gvDefectHistory`, `tbMachine`, `ddlStatus`, `ddlBreakDownList`, `ddlPauseList`, `tbiDmIN`, `ddlPrinter`, `tbQuantity`, `ddlQuantityUom`, `ddlqcStatus`, `tbqcStatusRemark`, `tbid`, `tbSerialNo`, `tbTotalQty`, `tbNetWt`, `tbFGSerialNo`, `tbASsetTag`, `tbGreenTag`, `tbBEENo`, `ddlqcPrinter`, `lbGuideFiles`, `imgGuideFileDisplay`, `gvInstruction`, `setupCheckList`, `inspectionCheckList`.

Events: `department`, `btnWorkStationScan`, `btnWorderScan`, `btnRM`, `btnINBarcode`, `btnInwardMaterial`, `btnRework`, `btnCloseInputMaterialPanel`, `btnGuide`, `lbGuideFiles`, `btnToggleGuide`, `imbGuideClose`, `go`, `ddlwipqcStatus`, `ddlDefectCate`, `btnAdd`, `gvTransDataDelete`, `btnUD`, `btnQCClose`, `btnQCClear`, `btnQCSave`, `inspectionCheckListNext`, `inspectionCheckListPrev`, `inspectionCheckListSave`, `inspectionCheckListValue`, `inspectionCheckListList`, `inspectionCheckListGo`, `inspectionCheckListSelect`, `inspectionCheckListFail`, `inspectionCheckListPass`, `inspectionCheckListClose`.

### FG Scrap — `/api/production/fg-scrap`

Original: `View/Production/FGScrapForm.aspx`. Fields: `tbDate`, `tbBarcode`, `gvDetails`, `ddlScrapCategory`, `tbRemark`.

Events: `go`, `btnSave`.

### Component Replacement — `/api/production/rm-replacements`

Original: `View/Production/RMReplacementForm.aspx`. Fields: `tbDate`, `tbBarcode`, `gvDetails`, `tbExistingRM`, `tbNewRM`, `qc`.

Events: `go`, `btnexistScan`, `btnNewScan`.

### Model Transfer — `/api/production/model-transfers`

Original: `View/Production/ModelToModelTransferForm.aspx`. Fields: `tbDate`, `ddlSourceMaterial`, `ddlDestiMaterial`, `tbStart`, `tbEnd`, `gvDetails`, `ddlPrinter`, `gvPrint`, `qc`.

Events: `ddlSourceMaterial`, `btnShow`, `btnPrint`.

### Process Guide — `/api/production/process-guides`

Original: `View/Production/ProcessGuideForm.aspx`. Fields: `ddlUser`, `department`, `businessUnit`, `tbWorkStation`, `tbJobCoard`, `gv`, `tbUserStation`, `ddlStation`, `ddlUserCode`, `tbPass`, `tbScanQrCode`, `gvUsers`, `lbGuideFiles`, `gvInstruction`.

Events: `btnWorkStationScan`, `btnWorderScan`, `lbGuideFiles`, `imbGuideClose`, `btnLogin`, `gvUsersLogout`, `btnStation`.

### Production Plan Upload — `/api/production/plan-uploads`

Original: `View/Production/ProdPlanUpload.aspx`. Fields: `tbDate`, `gvDetails`, `fileUpload1`.

Events: `btnImport`, `btnUpdate`.

### Image Display — `/api/production/image-display`

Original: `View/Production/WRLImageDisply.aspx`. Fields: `primaryKey`, `imgGuideFileDisplay`.

Events: `btnGo`.

Material also has its artwork, unit frame and basket images (`:kind` = `artwork`, `unitframe` or `basket`; table MaterialImages), each stored on its own as soon as it is uploaded, apart from the record's Save / Update: `GET /api/masters/materials/:code/images` (which ones it has: `kind`, `fileName`, `mimeType`, `size`, `updatedOn`), `GET …/images/:kind` (the file itself), `PUT …/images/:kind` with `{ fileName, data }` (base64; PNG, JPEG, WebP or PDF, told by the file's bytes, up to 10 MB; 404 for a material that does not exist) and `DELETE …/images/:kind`. Same access as the Material screen. The original screen had only the one image (`materialImage`); added by the owner, 28 Oct 2026.

Material's `route` is the material's routing (`Material.Route`): Production Assignment selects it when an order of that material is chosen. The original screen had no such field; added by the owner, 28 Oct 2026, as on LIVE.

Material Barcode is a reprint page (owner, 29 Oct 2026): `GET /api/masters/material-barcodes/reprint/:serial` finds the FG label, assembly or foaming barcode with that serial (or barcode number) in the user's business unit (`kind`, `serial`, `barcodeNo`, material, job card, production order, process, reprints; 404 for any other barcode), `GET …/reprint/printers` lists the unit's printers, and `POST …/reprint` with `{ barcodeNo, printer, remark }` prints the label again (the in-process label, as the original Print) and logs it in BarcodePrintTrail; `GET …/reprint/history?page=&start=&end=` lists those reprints, newest first, read only (reprinted on, label, serial, material, job card, reason, reprinted by; 1000 a page; the same time range as the histories below).

Many labels at once (e.g. 300 FG labels from their serials): `POST …/reprint/check` with `{ serials }` (up to 500; blanks and repeats left out) answers each serial in order, found (the label, as above) or `{ serial, error }`; `POST …/reprint/many` with `{ barcodeNos, printer, remark }` (up to 50 a request; the page sends 25 at a time) prints them in order with one reason and answers `[{ barcodeNo, serial, ok, error? }]`: a label that fails is reported and the rest go on. The serial lookup uses OPENJSON (database compatibility level 130 or higher).

Serial Generation Logic also has `POST /api/masters/serial-logics/preview` (owner, 29 Oct 2026; read only): `{ rows, barcodeLength, serialCode?, material? }` (the form's lines, saved or not) answers what the logic makes, built as production builds a serial from its lines (dates today, the model's Alt Name, the serial number padded to its length): `first`, `last` (its Ending No, else the largest the length holds), `count`, `length`, `parts` (each line's part and separator), `problems` (e.g. a length that differs from the Barcode Length, a start after the end), and for a saved logic the `materials` using it (the Model part's material, the first one by default). Nothing is taken or counted.

WIP Capture also has `GET /api/production/wip-capture/units/:label`: route and cabinet details of the scanned unit (`{ route, cabinet }`, each null when its lookup fails).

Model To Model Transfer works by a list of FG serials (owner, 29 Oct 2026; the page no longer offers the serial range form, which stays in the screen API): `POST /api/production/model-transfers/bulk/check` with `{ serials }` (up to 500; blanks and repeats left out) groups the live barcodes (status not 99) of FG materials (Type 100) by product, `{ groups: [{ materialCode, material, materialAlias, units: [{ serial, barcodeNo }] }], refused: [{ serial, error }] }`; `POST /api/production/model-transfers/bulk` with `{ source, destination, barcodeNos, printer }` (up to 50 a request; the page sends 25) moves each unit as the range transfer does (stock row, barcode, job card, location), prints its label again (its routing stage's number of copies) and logs it in ModelToModel one serial a row, answering `[{ barcodeNo, serial, ok, printed, error? }]` (`printed` false: moved, label not printed).

RM Replacement also has `GET /api/production/rm-replacements/history?page=&start=&end=`: the components replaced in units of the user's business unit, newest first, read only (replaced on, unit serial, component, process, old serial, new serial, operator; 1000 a page). The original screen had no list; added by the owner, 28 Oct 2026.

FG Scrap also has `GET /api/production/fg-scrap/history?page=&start=&end=`: the units / items scrapped on job cards of the user's business unit, newest first, read only (scrapped on, serial, material, scrap category, last station, remark, scrapped by; 1000 a page). The original screen had no list; added by the owner, 28 Oct 2026.

Both histories take an optional time range: `start` and `end` as `YYYY-MM-DDTHH:mm` (what a date-time box holds), each limit included. A value that is not a date and time, or a start after the end, answers 400.

## Screen engine — /api/forms

Every screen above also still answers through the screen engine (`spec`, `list`, `record`, `event`, `save`, `update`, `cancel`, `print`, `combo`, `unit`, `distinct`, `copy`, keyed by `?path=<route>`), which the client pages use today. Both run the same page code; a page moves to its API when that switch is approved.
