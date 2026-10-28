// /api/masters/materials/:code/images: a material's artwork, unit frame and basket images (table MaterialImages,
// db/migrations/2026-10-material-images.sql). New with this app (owner, 28 Oct 2026); the original screen had only the
// one MaterialImage. Each image is stored as soon as it is uploaded, on a saved material.
import { Router } from 'express';
import { authorizeScreen, requireAuth } from '../../middlewares/auth.js';
import { execute, query, scalar } from '../../db/pool.js';
import { AppError } from '../../shared/AppError.js';
import { ok } from '../../shared/http.js';

export const KINDS = ['artwork', 'unitframe', 'basket'];
const MAX_BYTES = 10 * 1024 * 1024;

/** the file's type from its first bytes (not the name or the browser's word for it): PNG, JPEG, WebP or PDF */
export function sniff(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 5 && buf.toString('latin1', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

/** :code and :kind checked */
export function target(code, kind) {
  const c = Number(code);
  if (!/^\d+$/.test(String(code)) || !Number.isSafeInteger(c) || c <= 0) throw AppError.badRequest('The material code is not valid.');
  if (kind !== undefined && !KINDS.includes(kind)) throw AppError.badRequest(`The image kind must be one of: ${KINDS.join(', ')}.`);
  return { code: c, kind };
}

/** which images the material has (no bytes) */
export const listImages = (code) =>
  query('select Kind kind, FileName fileName, MimeType mimeType, cast(datalength(Image) as int) size, UpdatedOn updatedOn from MaterialImages where MatCode=@code', { code });

export async function getImage(code, kind) {
  const [row] = await query('select Image image, FileName fileName, MimeType mimeType from MaterialImages where MatCode=@code and Kind=@kind', { code, kind });
  if (!row) throw AppError.notFound('Image');
  return row;
}

/** upload or replace: the file as base64 */
export async function putImage(code, kind, { fileName, data }, user) {
  const name = String(fileName ?? '').trim().slice(0, 260) || kind;
  const bytes = typeof data === 'string' ? Buffer.from(data, 'base64') : null;
  if (!bytes?.length) throw AppError.badRequest('Pick a file to upload.');
  if (bytes.length > MAX_BYTES) throw AppError.badRequest('The file is larger than 10 MB.');
  const mime = sniff(bytes);
  if (!mime) throw AppError.badRequest('Upload a PNG, JPEG, WebP or PDF file.');
  if ((await scalar('select count(*) from Material where MatCode=@code', { code })) === 0) throw AppError.notFound('Material');
  await execute(
    `merge MaterialImages as t using (select @code MatCode, @kind Kind) as s on t.MatCode=s.MatCode and t.Kind=s.Kind
     when matched then update set Image=@bytes, FileName=@name, MimeType=@mime, UpdatedOn=getdate(), UpdatedBy=@user
     when not matched then insert (MatCode, Kind, Image, FileName, MimeType, UpdatedBy) values (@code, @kind, @bytes, @name, @mime, @user);`,
    { code, kind, bytes, name, mime, user: Number(user) || 0 },
  );
  return { kind, fileName: name, mimeType: mime, size: bytes.length };
}

export async function removeImage(code, kind) {
  await execute('delete from MaterialImages where MatCode=@code and Kind=@kind', { code, kind });
  return { kind, removed: true };
}

const router = Router();
const guard = [requireAuth, authorizeScreen('/materialsetup/materialform')];
const at = (req) => target(req.params.code, req.params.kind);

router.get('/materials/:code/images', ...guard, async (req, res) => ok(res, await listImages(at(req).code)));
router.get('/materials/:code/images/:kind', ...guard, async (req, res) => {
  const { code, kind } = at(req);
  const img = await getImage(code, kind);
  res.set('Content-Type', img.mimeType);
  res.set('Cache-Control', 'private, no-cache');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(img.fileName)}`);
  res.send(img.image);
});
router.put('/materials/:code/images/:kind', ...guard, async (req, res) => {
  const { code, kind } = at(req);
  ok(res, await putImage(code, kind, req.body ?? {}, req.session.userCode));
});
router.delete('/materials/:code/images/:kind', ...guard, async (req, res) => {
  const { code, kind } = at(req);
  ok(res, await removeImage(code, kind));
});

export default router;
