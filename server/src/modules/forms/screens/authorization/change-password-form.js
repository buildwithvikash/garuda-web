// Change Password (View/Authorization/ChangePasswordForm.aspx): the original page's code-behind, ported (registered in registry.js).
import { netString } from '../../../../shared/net.js';
import { changePassword } from '../../../auth/auth.service.js';
import { errorMsg } from '../_shared.js';
import { PAGE_LOAD, PAGE_SAVE } from '../registry.js';

Object.assign(PAGE_LOAD, {
  // TBUser = logged-in user id (disabled, so the posted value is never used), PrimaryKey = user code
  'View/Authorization/ChangePasswordForm.aspx': (controls, ctx) => {
    Object.assign(controls.find((c) => c.id === 'TBUser'), { value: netString(ctx.userId), enabled: false });
    controls.find((c) => c.id === 'PrimaryKey').value = netString(ctx.userCode);
  },
});

Object.assign(PAGE_SAVE, {
  'View/Authorization/ChangePasswordForm.aspx': async (v, h) => {
    const out = { ok: true, message: 'Record Created Successfully', set: {} };
    if (v.TBCurPass !== '' && v.TBNewPass === v.TBRetypePass) {
      const code = await changePassword({ userId: netString(h.ctx.userId), current: v.TBCurPass, next: v.TBNewPass });
      if (code === 0) {
        out.alert = errorMsg('Pasword must be 8 character long, Includes  number and special character');
        Object.assign(out.set, { TBNewPass: { value: '' }, TBRetypePass: { value: '' } });
      } else if (code === 6) {
        out.alert = errorMsg('Current Password is wrong!!');
        out.set.TBCurPass = { value: '' };
      } else return { ok: true, message: 'Password Changed!!', logout: true };
    } else out.alert = errorMsg('Make sure that current password is not blank and retype password is correct');
    return out;
  },
});
