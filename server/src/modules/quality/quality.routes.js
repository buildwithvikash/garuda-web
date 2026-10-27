// /api/quality/<name>: the quality screens (inspection, NCMR, repair / rework / finishing confirmation, self
// inspection) as REST resources; the calls are in forms/resource.routes.js, the reference in docs/API.md.
// The QC panel (`qc`) and the approval footer (`footer`) are sent back as the screen gave them.
import { screensRouter } from '../forms/resource.routes.js';

/** API name -> screen */
export const QUALITY = {
  'final-inspections': '/quality/qualityinspectionform',
  'ncmr-confirmations': '/quality/ncmrconfirmation',
  'repair-confirmations': '/quality/repairconfirmation',
  'rework-confirmations': '/quality/reworkconfirmationnew',
  'finishing-confirmations': '/quality/finishingconfirmation',
  'self-inspections': '/ceat/ceatinselfinspectionform',
};

export default screensRouter(QUALITY);
