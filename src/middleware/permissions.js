const db = require('../db');
const president = u => ['MASTER','PASTOR_PRESIDENTE'].includes(String(u.perfil || '').toUpperCase());
const local = u => ['PASTOR_LOCAL','GESTOR_LOCAL'].includes(String(u.perfil || '').toUpperCase());
const coordenacao = u => String(u.escopo||'').toUpperCase()==='CIDADE' && ['SUPERINTENDENTE_CAMPANHAS','VICE_SUPERINTENDENTE_CAMPANHAS','SUPERINTENDENTE_DISCIPULADO','VICE_SUPERINTENDENTE_DISCIPULADO'].includes(String(u.cargo||'').toUpperCase());
const localDefaults = [
  'cidades.visualizar',
  'congregacoes.visualizar','congregacoes.inserir','congregacoes.editar','congregacoes.excluir',
  'congregacoes.gerenciar','pessoas.visualizar','pessoas.inserir','pessoas.editar',
  'pessoas.excluir','configuracoes.visualizar','configuracoes.tipos_congregacao',
  'relatorios.visualizar','resultados.cidades',
  'atividades.visualizar','atividades.gerenciar',
  'discipulado.estrutura.visualizar','discipulado.estrutura.gerenciar'
];

async function permissionsFor(user) {
  if (president(user)) return new Set(['*']);
  const q = await db.query(`
    SELECT DISTINCT p.codigo FROM usuario_permissoes up
    JOIN permissoes p ON p.id=up.permissao_id
    WHERE up.usuario_id=$1 AND up.ativo=TRUE
    UNION
    SELECT DISTINCT p.codigo FROM usuario_cargos uc
    JOIN cargos c ON c.id=uc.cargo_id AND c.denominacao_id=$2 AND c.ativo=TRUE
    JOIN cargo_permissoes cp ON cp.cargo_id=c.id
    JOIN permissoes p ON p.id=cp.permissao_id
    WHERE uc.usuario_id=$1 AND uc.ativo=TRUE
  `, [user.id,user.denominacao_id]);
  const result = new Set(q.rows.map(r => r.codigo));
  if (user.escopo !== 'DENOMINACAO') {
    for (const code of result)
      if (code.startsWith('cidades.') && code !== 'cidades.visualizar' ||
          code === 'usuarios.liberar' || code === 'pastores_locais.cadastrar') result.delete(code);
  }
  if (result.has('congregacoes.gerenciar'))
    ['visualizar','inserir','editar','excluir'].forEach(action => result.add('congregacoes.'+action));
  if (result.has('atividades.gerenciar')) result.add('atividades.visualizar');
  if (result.has('discipulado.estrutura.gerenciar'))
    result.add('discipulado.estrutura.visualizar');
  if (local(user)) localDefaults.forEach(code => result.add(code));
  if (coordenacao(user)) ['pessoas.visualizar','pessoas.inserir','pessoas.editar','atividades.visualizar','discipulado.estrutura.visualizar'].forEach(code=>result.add(code));
  return result;
}
function requirePermission(code) {
  return async (req,res,next) => {
    try {
      const p = await permissionsFor(req.user);
      if (p.has('*') || p.has(code)) return next();
      res.status(403).json({ erro: 'Você não tem permissão para esta operação.' });
    } catch (e) { next(e); }
  };
}
module.exports = { permissionsFor, requirePermission, president };
