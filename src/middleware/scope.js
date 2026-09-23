const db = require('../db');
function filter(user, cityColumn, churchColumn, start = 2) {
  if (user.escopo === 'DENOMINACAO') return { sql:'', values:[] };
  if (user.escopo === 'CIDADE' && user.cidade_ministerial_id)
    return { sql:` AND ${cityColumn}=$${start}`, values:[user.cidade_ministerial_id] };
  if (user.escopo === 'CONGREGACAO' && user.congregacao_id && churchColumn)
    return { sql:` AND ${churchColumn}=$${start}`, values:[user.congregacao_id] };
  return { sql:' AND FALSE', values:[] };
}
async function congregation(user, id) {
  const s=filter(user,'cidade_ministerial_id','id',3);
  const q=await db.query(`SELECT id FROM congregacoes WHERE id=$1 AND denominacao_id=$2 AND ativo=TRUE${s.sql}`,
    [id,user.denominacao_id,...s.values]);
  return q.rowCount>0;
}
module.exports={filter,congregation};
