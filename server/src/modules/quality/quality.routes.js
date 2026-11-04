// /api/quality/<name>: the quality screens (inspection, NCMR, repair / rework / finishing confirmation, self
// inspection) as REST resources; the calls are in forms/resource.routes.js, the reference in docs/API.md.
// The QC panel (`qc`) and the approval footer (`footer`) are sent back as the screen gave them.
import { screensRouter } from '../forms/resource.routes.js';

/** API name -> screen */
// (Final Inspection, NCMR, Repair, Finishing and Self Inspection were taken off the app, owner 28 Oct 2026, and their
//  code removed, 4 Nov 2026: to restore one, take back its handler from git history (forms/screens/quality/ or ceat/,
//  and its quality.service.js functions), then its entry here, e.g. 'final-inspections': '/quality/qualityinspectionform',
//  and its route in menu/keep.js)
// Rework Confirmation has a module of its own (rework-confirmations/).
export const QUALITY = {};

export default screensRouter(QUALITY);
