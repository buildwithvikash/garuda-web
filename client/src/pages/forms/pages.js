// Client-side bits of individual engine pages (their code-behind runs on the server: server/src/modules/forms/pages.js).
// checkSearch: a TextBox filtering a CheckBoxList (the page's SearchCheckList script); labels: captions the markup
// gives without a Tag.

export const PAGES = {
  '/productionsetup/workcenterform': {
    checkSearch: { TBCheckListSearch: 'CBProcess' },
    labels: { CBProcess: 'Process List' },
  },
  '/settings/workcenteravailabilityform': {
    checkSearch: { TBCheckListSearch: 'cbWorkstations' },
  },
  '/authorization/userroleform': {
    labels: { TreeView1: 'Detail' },
  },
};
