const { sb, json, currentUser, handler } = require('./_lib');

module.exports = (req, res) => handler(req, res, async () => {
  if (req.method !== 'GET') return json(res, 405, { error: 'Méthode non autorisée' });
  const actor = await currentUser(req);
  if (!actor) return json(res, 401, { error: 'Non connecté' });
  const filePath = String(req.query.path || '');
  if (!filePath || filePath.includes('..')) return json(res, 400, { error: 'Fichier manquant' });
  const { data, error } = await sb.from('pret_storage').select('*').eq('path', filePath).maybeSingle();
  if (error) return json(res, 500, { error: error.message });
  if (!data || !data.content_base64) return json(res, 404, { error: 'Fichier introuvable' });
  res.statusCode = 200;
  res.setHeader('Content-Type', data.mime || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(Buffer.from(data.content_base64, 'base64'));
});
