// Image Display (View/Production/WRLImageDisply.aspx): the original page's code-behind, ported (registered in registry.js).
import { query } from '../../../../db/pool.js';
import { guard } from '../_shared.js';
import { PAGE_EVENTS } from '../registry.js';

Object.assign(PAGE_EVENTS, {
  'View/Production/WRLImageDisply.aspx': {
    // BtnGo_Click: AVHistory.WRLShowImage (AU.FillimgView: the first row's image as a data URL)
    BtnGo: async (v) => {
      const out = { set: {} };
      return guard(out, async () => {
        if (v.PrimaryKey.trim() === '') return;
        const rows = await query("select m.MaterialImage FROM Material m inner join MaterialBarcode mb on m.MatCode = mb.Material where mb.Serial =@s", { s: v.PrimaryKey });
        if (!rows.length) throw new Error('There is no row at position 0.');
        const img = rows[0].MaterialImage;
        if (!Buffer.isBuffer(img)) throw new Error("Unable to cast object of type 'System.DBNull' to type 'System.Byte[]'.");
        Object.assign(out.set, { ImgGuideFileDisplay: { value: `data:image/png;base64,${img.toString('base64')}` }, PrimaryKey: { value: '' } });
      });
    },
  },
});
