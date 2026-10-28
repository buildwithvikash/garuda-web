# Functional inventory: the 47 Garuda WRL screens

Generated from the code on 2026-10-28 (forms.json specs, the screens' registries, each screen file's SQL, the parity scripts). Original application: `source/Garuda` (ASP.NET Web Forms) + its business DLLs in `build/Publish WRL/bin`, both untouched.

**Scope.** The original has 437 pages; the owner limited the new app to these 47 (keep-list, `server/src/modules/menu/keep.js`, 21 Oct). Reports, dashboards and the other 390 pages are out of scope by that decision. The original has no web services, background jobs or API controllers: its business logic runs in its pages and DLLs. External dependencies of the 47: SQL Server (same database and schema), label printers (raw TCP 9100 or a Windows driver), the station guide files folder, the sharecad.org drawing viewer; one ERP posting step (partial rework confirmation) is not ported.

**How to read it.** *New implementation*: the screen engine (`/api/forms`, the screen's ported page code in `modules/forms/screens/...`) or a domain API of its own. *Ported behaviour*: the page events (AutoPostBack handlers, buttons) and own handlers (load / save / update / delete / print ...) the original page had beyond the generic form. *Saves to*: the tables its form saves through the writer plus tables its own code writes (the shared production / quality services write more, see each service). *Parity*: the suites that run the original page and the new code on the same inputs for this screen (`forms`: open, list, display a record, for all 47).

## Authorization

| # | Screen | Route | Original page | New implementation | Ported behaviour | Saves to | Parity | Gaps / notes |
|---|---|---|---|---|---|---|---|---|
| 1 | Change Password | `/authorization/changepasswordform` | ChangePasswordForm.aspx | domain API /api/masters/change-password (modules/masters); `screens/authorization/change-password-form.js` | load, save | — | forms, page-writes |  |
| 2 | Reset Password | `/authorization/resetpasswordform` | ResetPasswordForm.aspx | domain API /api/masters/reset-password (modules/masters); `screens/authorization/reset-password-form.js` | save, init | — | forms, page-writes |  |
| 3 | User Role | `/authorization/userroleform` | UserRoleForm.aspx | domain API /api/masters/user-roles (modules/masters) | generic form only | UserRoles, UserRoleForm | forms |  |
| 4 | Users | `/authorization/usersform` | UsersForm.aspx | domain API /api/masters/users (modules/masters); `screens/authorization/users-form.js` | 1 event; save | Users, UserBusinessUnits, UserProcess | forms, events |  |

## Business Setup

| # | Screen | Route | Original page | New implementation | Ported behaviour | Saves to | Parity | Gaps / notes |
|---|---|---|---|---|---|---|---|---|
| 5 | Business Unit | `/businesssetup/businessunitform` | BusinessUnitForm.aspx | domain API /api/masters/business-units (modules/masters); `screens/business-setup/business-unit-form.js` | generic form only | BusinessUnit | forms |  |
| 6 | Company Configuration | `/businesssetup/companyform` | CompanyForm.aspx | domain API /api/masters/company (modules/masters) | generic form only | Company | forms, forms-write, page-writes |  |
| 7 | Department | `/businesssetup/departmentform` | DepartmentForm.aspx | domain API /api/masters/departments (modules/masters) | generic form only | Department | forms |  |
| 8 | Ledger Master | `/businesssetup/ledgerform` | LedgerForm.aspx | domain API /api/masters/ledgers (modules/masters) | generic form only | Ledger | forms, forms-write |  |

## Material Setup

| # | Screen | Route | Original page | New implementation | Ported behaviour | Saves to | Parity | Gaps / notes |
|---|---|---|---|---|---|---|---|---|
| 9 | Bill Of Material | `/materialsetup/billofmaterial` | BillOfMaterial.aspx | domain API /api/masters/bills-of-material (modules/masters); `screens/material-setup/bill-of-material.js` | 16 events; lists, init | BOMHeader, BOMInput, BOMOutput, BOMInputAltMaterial | forms, events |  |
| 10 | Material Barcode | `/materialsetup/materialbarcode` | MaterialBarcode.aspx | domain API /api/masters/material-barcodes (modules/masters); `screens/material-setup/material-barcode.js` | 3 events; save, print, display | MaterialBarcode, BarcodePrintTrail | forms, events, print |  |
| 11 | Material Category | `/materialsetup/materialcategoryform` | MaterialCategoryForm.aspx | domain API /api/masters/material-categories (modules/masters); `screens/material-setup/material-category-form.js` | 1 event | MaterialCategory | forms, events |  |
| 12 | Material Master | `/materialsetup/materialform` | MaterialForm.aspx | domain API /api/masters/materials (modules/masters); `screens/material-setup/material-form.js` | 11 events; lists, init | Material, MaterialVariant, MaterialLedgerMap | forms, events |  |
| 13 | Model | `/materialsetup/modelform` | ModelForm.aspx | domain API /api/masters/models (modules/masters); `screens/material-setup/model-form.js` | 4 events; lists | Model, ModelVariant | forms, events, grid-db |  |
| 14 | Serial Generation Logic | `/materialsetup/serialgenerationlogicform` | SerialGenerationLogicForm.aspx | domain API /api/masters/serial-logics (modules/masters); `screens/material-setup/serial-generation-logic-form.js` | 4 events; update, display | SerialGenerationLogicHeader, SerialGenerationLogicDetail, SerialBarcode | forms, events, page-writes |  |
| 15 | Unit Of Measure | `/materialsetup/unitofmeasureform` | UnitOfMeasureForm.aspx | domain API /api/masters/units-of-measure (modules/masters) | generic form only | UnitOfMeasure | forms, forms-write |  |
| 16 | Variant Field | `/materialsetup/variantfieldform` | VariantFieldForm.aspx | domain API /api/masters/variant-fields (modules/masters) | generic form only | VariantField | forms, forms-write |  |
| 17 | Variant Value | `/materialsetup/variantfieldvalueform` | VariantFieldValueForm.aspx | domain API /api/masters/variant-values (modules/masters) | generic form only | VariantFieldValue | forms, forms-write |  |

## Production

| # | Screen | Route | Original page | New implementation | Ported behaviour | Saves to | Parity | Gaps / notes |
|---|---|---|---|---|---|---|---|---|
| 18 | FG Scrap | `/production/fgscrapform` | FGScrapForm.aspx | domain API /api/production/fg-scrap (modules/production); `screens/production/fg-scrap-form.js` | 2 events; init | MaterialBarcode, ProcessInputBOMScan, FGScrap, PlanOrderPrint | forms, events, production-writes |  |
| 19 | Model To Model Transfer | `/production/modeltomodeltransferform` | ModelToModelTransferForm.aspx | domain API /api/production/model-transfers (modules/production); `screens/production/model-to-model-transfer-form.js` | 3 events; init | — | forms, events, print |  |
| 20 | Process Guide | `/production/processguideform` | ProcessGuideForm.aspx | domain API /api/production/process-guides (modules/production); `screens/production/process-guide-form.js` | 7 events; load, init | ProcessUserLogin | forms, events |  |
| 21 | Production Plan Upload | `/production/prodplanupload` | ProdPlanUpload.aspx | domain API /api/production/plan-uploads (modules/production); `screens/production/prod-plan-upload.js` | 2 events; load | PlanOrderPrint | forms, upload |  |
| 22 | Production Assignment | `/production/productionassignmentform` | ProductionAssignmentForm.aspx | domain API /api/production/assignments (modules/production-assignments); `screens/production/production-assignment-form.js` | 6 events; load | ProcessOrder, ProcessRouting, ProcessInputBOM, ProcessOutputBOM, ProcessStageLabel, PRODHeader, MaterialBarcode | forms, events, print |  |
| 23 | Production Order | `/production/productionorderform` | ProductionOrderForm.aspx | domain API /api/production/orders (modules/production-orders); `screens/production/production-order-form.js` | 5 events; display, lists | PRODHeader, PRODMaterial | forms, events | order type 4 (service request) fails on TEST: no SRHeader table, as the original; material lists show the name only (owner, 26 Oct) |
| 24 | RM Replacement | `/production/rmreplacementform` | RMReplacementForm.aspx | domain API /api/production/rm-replacements (modules/production); `screens/production/rm-replacement-form.js` | 3 events; init | — | forms, events, production-writes |  |
| 25 | WIP Capture | `/production/wipcaptureform` | WIPCaptureForm.aspx | domain API /api/production/wip-capture (modules/production); `screens/production/wip-capture-form.js` | 31 events; load | InspectionDefect | forms, wip | scan result 20 (multi-qty stage output), stage type 7 and department indicators other than 10000 not ported; output printing for serial logic > 1 not ported |
| 26 | Material Image Display | `/production/wrlimagedisply` | WRLImageDisply.aspx | domain API /api/production/image-display (modules/production); `screens/production/wrl-image-disply.js` | 1 event | ProcessOrder | forms, events |  |

## Production Setup

| # | Screen | Route | Original page | New implementation | Ported behaviour | Saves to | Parity | Gaps / notes |
|---|---|---|---|---|---|---|---|---|
| 27 | Production Line | `/productionsetup/productionlineform` | ProductionLineForm.aspx | domain API /api/masters/production-lines (modules/masters) | generic form only | ProductionLine | forms, forms-write |  |
| 28 | Production Process | `/productionsetup/productionprocess` | ProductionProcess.aspx | domain API /api/masters/production-processes (modules/masters) | generic form only | ProductionProcess | forms, forms-write |  |
| 29 | Routing | `/productionsetup/routingform` | RoutingForm.aspx | domain API /api/masters/routings (modules/masters); `screens/production-setup/routing-form.js` | 14 events; display, init | RoutingHeader, RoutingTrans, RouteInstruction, RoutingGuide | forms, events |  |
| 30 | Routing Guide | `/productionsetup/routingguideform` | RoutingGuideForm.aspx | domain API /api/masters/routing-guides (modules/masters); `screens/production-setup/routing-guide-form.js` | 11 events | RoutingHeader, RoutingTrans, RouteInstruction, RoutingGuide | forms, events |  |
| 31 | Work Center | `/productionsetup/workcenterform` | WorkCenterForm.aspx | domain API /api/masters/work-centers (modules/masters) | generic form only | WorkCenter, WorkCenterProcesses | forms |  |

## Quality

| # | Screen | Route | Original page | New implementation | Ported behaviour | Saves to | Parity | Gaps / notes |
|---|---|---|---|---|---|---|---|---|
| 32 | Rework Confirmation New | `/quality/reworkconfirmationnew` | ReworkConfirmationNew.aspx | domain API /api/quality/rework-confirmations (modules/quality); `screens/quality/rework-confirmation-new.js` | 14 events; load, save, init, list_tag | InspectionTrans, InspectionDefect | forms, events, rework-new | confirming part of a quantity needs the ERP posting split: not ported |

## Settings

| # | Screen | Route | Original page | New implementation | Ported behaviour | Saves to | Parity | Gaps / notes |
|---|---|---|---|---|---|---|---|---|
| 33 | Defect Code Master | `/settings/defectcodemasterform` | DefectCodeMasterForm.aspx | domain API /api/masters/defect-codes (modules/masters) | generic form only | DefectCodeMaster | forms, forms-write |  |
| 34 | Employee | `/settings/employeeform` | EmployeeForm.aspx | domain API /api/masters/employees (modules/masters); `screens/settings/employee-form.js` | print | Employee | forms, print |  |
| 35 | Identification Tag Design | `/settings/materialtagform` | MaterialTagForm.aspx | domain API /api/masters/material-tags (modules/masters) | generic form only | MaterialTag | forms, forms-write |  |
| 36 | CheckList Master | `/settings/parameterform` | ParameterForm.aspx | domain API /api/masters/check-lists (modules/masters); `screens/settings/parameter-form.js` | 4 events; init | ParameterHeader, ParameterTran | forms, events |  |
| 37 | Value List | `/settings/parametervaluelistform` | ParameterValueListForm.aspx | domain API /api/masters/value-lists (modules/masters); `screens/settings/parameter-value-list-form.js` | 2 events | ParameterListHeader, ParameterListTran | forms, events |  |
| 38 | Barcode Printer | `/settings/printerform` | PrinterForm.aspx | domain API /api/masters/printers (modules/masters); `screens/settings/printer-form.js` | init | BarcodePrinter | forms, forms-write |  |
| 39 | Rework Resolution | `/settings/reworkresolutionform` | ReworkResolutionForm.aspx | domain API /api/masters/rework-resolutions (modules/masters) | generic form only | ReworkResolution | forms, forms-write |  |
| 40 | Root Cause | `/settings/rootcauseform` | RootCauseForm.aspx | domain API /api/masters/root-causes (modules/masters) | generic form only | RootCause | forms, forms-write |  |
| 41 | Scrap Reasons | `/settings/scrapreasonform` | ScrapReasonForm.aspx | domain API /api/masters/scrap-reasons (modules/masters) | generic form only | ScrapReasons | forms, forms-write |  |
| 42 | Shift | `/settings/shiftmasterform` | ShiftMasterForm.aspx | domain API /api/masters/shifts (modules/masters); `screens/settings/shift-master-form.js` | 2 events | Shift, ShiftBreaks | forms, events |  |

## Backend features outside the screens (old → new)

| Feature | Original (.NET) | New | Parity |
|---|---|---|---|
| Sign-in (result codes 0 no user, 1 ok, 2 locked, 3 expired, 5 inactive, 6 wrong password, 7 must change, 8 wrong organization); QR sign-in | Login.aspx → AVLogin.ValidateLogin / ValidateLoginQR | `modules/auth/auth.service.js`, `POST /api/auth/login` | login (834 cases, 0 mismatches) |
| Change password | AVLogin.ChangePassword | `auth.service.js`, `POST /api/auth/change-password` | login |
| Password encryption (stored values must match byte for byte) | WrapperAvatar.encrypt (PBKDF2-SHA1 + AES-CBC) | `modules/auth/password.js` | tests/password |
| Session (user, business unit, role values) | ASP.NET Session | signed httpOnly cookie, `modules/auth/sessions.js` | tests/login |
| Failed sign-in throttle | — (new; security) | `modules/auth/throttle.js` | tests/throttle |
| Menu and role filtering, caption overrides, default form | Layout.Master + AVLogin.GetUserForms / GetDefaultForm | `modules/menu/menu.service.js` (menu.json) + keep-list | tests/keep-list |
| Screen permission check | page-level role check | `middlewares/auth.js` authorize / authorizeScreen | smoke (401/403) |
| Settings table | Avatar.Settings | `modules/settings/settings.service.js` | login |
| Label printing (MaterialTag template → TCP 9100 or Windows driver) | Avatar.AVLabelPrint, Akaar.AIPPrint, ADriverPrint | `modules/production/labels.service.js`, `raw-print.ps1` | print |
| WIP / production writes (stage output, QC, FG, rework) | business DLLs called from the production pages | `modules/production/*.service.js`, `modules/quality/quality.service.js` | wip, rework, production-writes |
| Excel upload into masters | page upload handlers | `importExcel` in the screen engine | upload |
| Operator messages (friendly error text) | page alert scripts | `middlewares/operatorMessages.js` | tests/messages |
| Security headers, request log | — (IIS defaults) | `middlewares/securityHeaders.js`, `requestLog.js` | — |

## Parity coverage gaps

0 screens have page code but are only checked by `forms` (open / list / display), not by an event or write suite: none.
