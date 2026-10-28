// /api/quality/<name>: the quality screens (inspection, NCMR, repair / rework / finishing confirmation, self
// inspection) as REST resources; the calls are in forms/resource.routes.js, the reference in docs/API.md.
// The QC panel (`qc`) and the approval footer (`footer`) are sent back as the screen gave them.
import { screensRouter } from '../forms/resource.routes.js';

/** API name -> screen */
// (Final Inspection, NCMR, Repair, Finishing and Self Inspection were taken off the app, owner 28 Oct 2026; to restore:
//  'final-inspections': '/quality/qualityinspectionform', 'ncmr-confirmations': '/quality/ncmrconfirmation',
//  'repair-confirmations': '/quality/repairconfirmation', 'finishing-confirmations': '/quality/finishingconfirmation',
//  'self-inspections': '/ceat/ceatinselfinspectionform', with the routes in menu/keep.js)
export const QUALITY = {
  'rework-confirmations': '/quality/reworkconfirmationnew',
};

export default screensRouter(QUALITY);
