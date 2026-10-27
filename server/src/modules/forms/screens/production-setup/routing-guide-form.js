// Routing (View/ProductionSetup/RoutingGuideForm.aspx): the original page's code-behind, ported (registered in registry.js).
import { ROUTING } from './routing-form.js';
import { CUSTOM_DISPLAY, PAGE_EVENTS } from '../registry.js';

const ROUTING_GUIDE = 'View/ProductionSetup/RoutingGuideForm.aspx';

CUSTOM_DISPLAY.add(ROUTING_GUIDE);

PAGE_EVENTS[ROUTING_GUIDE] = Object.fromEntries(
  ['DDLModel', 'GVTransData:Instruction', 'GVTransData:Guide', 'IMBInstructionClose', 'IMBGuideClose', 'BtnInstructionAdd', 'GVInstruction:delete', 'GVGuide:delete', 'DDLExistingGuide', 'DDLGuideFileType', 'BTNGuideAdd'].map((k) => [k, PAGE_EVENTS[ROUTING][k]]),
);
