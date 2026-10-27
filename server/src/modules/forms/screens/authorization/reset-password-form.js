// Reset Password (View/Authorization/ResetPasswordForm.aspx): the original page's code-behind, ported (registered in registry.js).
import { resetPassword } from '../../../auth/auth.service.js';
import { errorMsg } from '../_shared.js';
import { PAGE_INIT, PAGE_SAVE } from '../registry.js';

Object.assign(PAGE_SAVE, {
  'View/Authorization/ResetPasswordForm.aspx': async (v) => {
    if (v.DDLUser === '') return { ok: false, message: ' Please Select a User' };
    if (v.TBNewPass.trim() === '') return { ok: false, message: 'Password cant be blank' };
    const out = { ok: true, message: 'Record Created Successfully', set: {} };
    if (v.TBNewPass === v.TBRetypePass) {
      // the list's values are user codes, looked up as UserID (as the original did)
      if ((await resetPassword({ userId: v.DDLUser, next: v.TBNewPass })) === 0) {
        out.alert = errorMsg('Pasword must be 8 character long, Includes  number and special character');
        Object.assign(out.set, { TBNewPass: { value: '' }, TBRetypePass: { value: '' } });
      } else return { ok: true, message: 'Password Changed!!', logout: true };
    } else out.alert = errorMsg('Make sure that New password is not blank and retype password is correct');
    return out;
  },
});

Object.assign(PAGE_INIT, {
  'View/Authorization/ResetPasswordForm.aspx': async (controls, vs, h) => {
    controls.find((c) => c.id === 'DDLUser').options = await h.fill("Select usercode,Concat(UserID, ' ',UserName)[userName] from Users order by UserID ");
  },
});
