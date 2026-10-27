// User Master (View/Authorization/UsersForm.aspx): the original page's code-behind, ported (registered in registry.js).
import { netBool } from '../../../../shared/net.js';
import { insert, collect } from '../../write.js';
import { setting } from '../../../settings/settings.service.js';
import { PAGE_EVENTS, PAGE_SAVE } from '../registry.js';

Object.assign(PAGE_SAVE, {
  // AActions.Save(TopPanel, "50", Settings.PasswordEncrypt): EventLog module "50"
  'View/Authorization/UsersForm.aspx': async (v, h) => {
    const key = await insert(h.spec, await collect(h.spec, h.raw ?? v, h.ctx, { encryptPass: Number(setting('PasswordEncrypt')) || 0 }), h.ctx, { module: '50' });
    return { ok: true, key, message: 'Record Created Successfully' };
  },
});

Object.assign(PAGE_EVENTS, {
  'View/Authorization/UsersForm.aspx': {
    // CBAllProcess_CheckedChanged: every process ticked / unticked
    CBAllProcess: async (v, h) => ({ set: { CheckBoxList1: { value: netBool(v.CBAllProcess) ? (await h.options('CheckBoxList1')).map((o) => o.value) : [] } } }),
  },
});
