const paramsPagina=new URLSearchParams(location.search);const somenteGestores=paramsPagina.get('cargo')==='PASTOR_LOCAL';const modoPermissoes=paramsPagina.get('modo')==='permissoes';
if(modoPermissoes){const card=document.getElementById('cardNovoAcesso');if(card)card.style.display='none';const titulo=document.getElementById('tituloAcessos');if(titulo)titulo.textContent='Permissões';const sub=document.getElementById('subtituloAcessos');if(sub)sub.textContent='Selecione um usuário já cadastrado para consultar ou alterar suas permissões.';}
const token=localStorage.getItem('ide_token');
const headers={'Content-Type':'application/json','Authorization':'Bearer '+token};
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const cityRoles=['PASTOR_LOCAL','SUPERINTENDENTE_CAMPANHAS','VICE_SUPERINTENDENTE_CAMPANHAS',
  'SUPERINTENDENTE_DISCIPULADO','VICE_SUPERINTENDENTE_DISCIPULADO'];
const churchRoles=['DIRIGENTE','VICE_DIRIGENTE','SECRETARIO_CAMPANHA'];
let allPermissions=[],allCities=[],allChurches=[];
let me={};
let editingId=null;
let hiddenEditingIds=[];
let userScopes={};let usersCache=[];
if(!token)location.href='/';
async function api(url,options={}) {
  let r;
  try{r=await fetch(url,{headers,...options});}
  catch(err){
    if(!['POST','PUT','PATCH','DELETE'].includes(String(options.method||'GET').toUpperCase()))throw err;
    await new Promise(resolve=>setTimeout(resolve,500));
    r=await fetch(url,{headers,...options});
  }
  if(r.status===401){localStorage.removeItem('ide_token');location.href='/';throw new Error('Sessão expirada.');}
  const data=await r.json();
  if(!r.ok)throw new Error(data.erro||'Não foi possível concluir.');
  return data;
}
function scope() {
  return cityRoles.includes(cargo.value)?'CIDADE':churchRoles.includes(cargo.value)?'CONGREGACAO':'DENOMINACAO';
}
function allowed(p) {
  if(!['CIDADES','CONGREGACOES','GESTAO_LOCAL','PESSOAS','CONFIGURACOES','ATIVIDADES','DISCIPULADO_ESTRUTURA'].includes(p.modulo))return false;
  if(scope()==='DENOMINACAO')return true;
  if(p.codigo.startsWith('cidades.')||p.codigo==='pastores_locais.cadastrar'||p.codigo==='usuarios.liberar')return false;
  if(scope()==='CONGREGACAO' && (p.modulo==='CONFIGURACOES'||p.modulo==='RESULTADOS'))return false;
  return true;
}
function drawPermissions(selected=[]) {
  if(!cargo.value){permissoes.textContent='Escolha um cargo para ver as opções.';return;}
  const groups={};
  for(const p of allPermissions.filter(allowed)) (groups[p.modulo]??=[]).push(p);
  permissoes.innerHTML=Object.entries(groups).map(([name,items])=>
    '<fieldset class="access-group"><legend>'+esc(name.replaceAll('_',' '))+'</legend>'+
    items.map(p=>'<label><input type="checkbox" name="permissao" value="'+p.id+'" '+
      (selected.includes(p.id)?'checked':'')+'> '+esc(p.nome)+'</label>').join('')+'</fieldset>').join('');
  if(cargo.value==='PASTOR_LOCAL') {
    ajudaPermissoes.textContent='O Pastor Local já pode administrar congregações, pessoas e modelos ministeriais da sua cidade. Marque somente funções adicionais.';
  } else ajudaPermissoes.textContent='Marque somente as ações necessárias para esta pessoa.';
}
function changeScope(){
  const s=scope();
  campoCidade.style.display=s==='DENOMINACAO'?'none':'';
  campoCongregacao.style.display=s==='CONGREGACAO'?'':'none';
  cidadeMinisterial.required=s!=='DENOMINACAO';
  congregacao.required=s==='CONGREGACAO';
  if(s==='DENOMINACAO'){cidadeMinisterial.value='';congregacao.value='';}
  drawPermissions();
}
function loadChurches(){
  const visible=allChurches.filter(x=>String(x.cidade_ministerial_id)===cidadeMinisterial.value);
  congregacao.innerHTML='<option value="">Selecione a congregação</option>'+
    visible.map(x=>'<option value="'+x.id+'">'+esc(x.nome)+'</option>').join('');
}
async function loadUsers(){
  const people=await api('/api/acessos/usuarios');usersCache=people;
  userScopes=Object.fromEntries(people.map(x=>[x.id,x.escopo]));
  listaUsuarios.innerHTML=people.length?people.map(x=>
    '<div class="access-row"><div><strong>'+esc(x.nome)+'</strong> '+
    (x.ativo?'':'<small>(acesso suspenso)</small>')+
    '<br><small>'+esc((x.cargo||x.perfil).replaceAll('_',' '))+
    (x.cidade?' • '+esc(x.cidade):'')+(x.congregacao?' • '+esc(x.congregacao):'')+
    ' • '+esc(x.email)+'</small></div>'+
    (['MASTER','PASTOR_PRESIDENTE'].includes(x.perfil)?'':
      (modoPermissoes?'<div><button type="button" data-edit="'+x.id+'">Permissões</button></div>':'<div><button type="button" data-change="'+x.id+'">Alterar</button> <button type="button" data-active="'+x.id+'" data-value="'+(!x.ativo)+'">'+(x.ativo?'Suspender':'Reativar')+'</button> <button type="button" class="btn-excluir-acesso" data-delete="'+x.id+'" data-name="'+esc(x.nome)+'">Excluir</button></div>'))+'</div>'
  ).join(''):'Nenhuma pessoa cadastrada.';
}
cargo.addEventListener('change',changeScope);
cidadeMinisterial.addEventListener('change',loadChurches);
formUsuario.addEventListener('reset',()=>setTimeout(()=>{changeScope();loadChurches();msg.textContent='';},0));
formUsuario.addEventListener('submit',async e=>{
  e.preventDefault();
  if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  if(!formUsuario.reportValidity())return;
  salvar.disabled=true;salvar.textContent='Salvando...';msg.textContent='';
  try{
    const fd=new FormData(formUsuario);
    const body={nome:fd.get('nome'),email:fd.get('email'),telefone:fd.get('telefone'),
      senha:fd.get('senha'),cargo:fd.get('cargo'),
      cidade_ministerial_id:scope()==='DENOMINACAO'?null:Number(fd.get('cidade_ministerial_id')),
      congregacao_id:scope()==='CONGREGACAO'?Number(fd.get('congregacao_id')):null,
      permissoes:[...document.querySelectorAll('input[name="permissao"]:checked')].map(x=>Number(x.value))};
    const id=usuarioEditando.value;if(id){await api('/api/acessos/usuarios/'+id,{method:'PUT',body:JSON.stringify(body)});}else{await api('/api/acessos/usuarios',{method:'POST',body:JSON.stringify(body)});}
    msg.textContent=usuarioEditando.value?'Cadastro alterado com sucesso.':'Acesso criado. A pessoa já pode entrar com o e-mail e a senha inicial.';
    formUsuario.reset();usuarioEditando.value='';formUsuario.senha.required=true;cancelarAlteracao.style.display='none';await loadUsers();
  }catch(err){msg.textContent=err.message==='Load failed'?'Falha momentânea de conexão. Toque em Salvar novamente.':err.message;}
  finally{salvar.disabled=false;salvar.textContent='Salvar e liberar acesso';}
});
listaUsuarios.addEventListener('click',async e=>{
  const edit=e.target.closest('[data-edit]'),change=e.target.closest('[data-change]'),active=e.target.closest('[data-active]'),del=e.target.closest('[data-delete]');
  try{
    if(change){const x=usersCache.find(u=>String(u.id)===String(change.dataset.change));if(x){usuarioEditando.value=x.id;formUsuario.nome.value=x.nome||'';formUsuario.telefone.value=x.telefone||'';formUsuario.email.value=x.email||'';formUsuario.senha.value='';formUsuario.senha.required=false;cargo.value=x.cargo||'PASTOR_LOCAL';changeScope();cidadeMinisterial.value=x.cidade_ministerial_id||'';loadChurches();congregacao.value=x.congregacao_id||'';salvar.textContent='Salvar alteração';cancelarAlteracao.style.display='';document.getElementById('cardNovoAcesso').scrollIntoView({behavior:'smooth'});}return;}
    if(edit){
      const rows=await api('/api/acessos/usuarios/'+edit.dataset.edit+'/permissoes');
      editingId=edit.dataset.edit;
      hiddenEditingIds=rows.filter(p=>p.liberada &&
        !['CIDADES','CONGREGACOES','GESTAO_LOCAL','PESSOAS','CONFIGURACOES','ATIVIDADES','DISCIPULADO_ESTRUTURA'].includes(p.modulo) &&
        (userScopes[editingId]==='DENOMINACAO' ||
          !(p.codigo.startsWith('cidades.')||p.codigo==='usuarios.liberar'||p.codigo==='pastores_locais.cadastrar'))).map(p=>p.id);
      const groups={};
      for(const p of rows) {
        if(!['CIDADES','CONGREGACOES','GESTAO_LOCAL','PESSOAS','CONFIGURACOES','ATIVIDADES','DISCIPULADO_ESTRUTURA'].includes(p.modulo))continue;
        if(userScopes[editingId]!=='DENOMINACAO' &&
          (p.codigo.startsWith('cidades.') || p.codigo==='pastores_locais.cadastrar' || p.codigo==='usuarios.liberar')) continue;
        (groups[p.modulo]??=[]).push(p);
      }
      editorLista.innerHTML=Object.entries(groups).map(([name,items])=>
        '<fieldset class="access-group"><legend>'+esc(name.replaceAll('_',' '))+'</legend>'+
        items.map(p=>'<label><input type="checkbox" value="'+p.id+'" '+(p.liberada?'checked':'')+
          '> '+esc(p.nome)+'</label>').join('')+'</fieldset>').join('');
      editorMsg.textContent='';const xs=[...editorLista.querySelectorAll('input[type="checkbox"]')];editorMarcarTodos.checked=xs.length>0&&xs.every(x=>x.checked);editorMarcarTodos.indeterminate=xs.some(x=>x.checked)&&!xs.every(x=>x.checked);editorPermissoes.showModal();
    }
    if(del){
      const nome=del.dataset.name||'este usuário';
      if(!confirm('Excluir definitivamente o acesso de "'+nome+'"?\n\nEsta ação não poderá ser desfeita.'))return;
      del.disabled=true;del.textContent='Excluindo...';
      await api('/api/acessos/usuarios/'+del.dataset.delete,{method:'DELETE'});
      msg.textContent='Acesso excluído com sucesso.';
      await loadUsers();return;
    }
    if(active){
      const value=active.dataset.value==='true';
      if(!confirm(value?'Reativar este acesso?':'Suspender este acesso agora?'))return;
      await api('/api/acessos/usuarios/'+active.dataset.active+'/ativo',
        {method:'PATCH',body:JSON.stringify({ativo:value})});
      msg.textContent=value?'Acesso reativado.':'Acesso suspenso.';
      await loadUsers();
    }
  }catch(err){msg.textContent=err.message;}
});
editorMarcarTodos.addEventListener('change',()=>{editorLista.querySelectorAll('input[type="checkbox"]').forEach(x=>x.checked=editorMarcarTodos.checked);});
editorLista.addEventListener('change',()=>{const xs=[...editorLista.querySelectorAll('input[type="checkbox"]')];editorMarcarTodos.checked=xs.length>0&&xs.every(x=>x.checked);editorMarcarTodos.indeterminate=xs.some(x=>x.checked)&&!xs.every(x=>x.checked);});
editorSalvar.addEventListener('click',async()=>{
  editorSalvar.disabled=true;editorMsg.textContent='Gravando...';
  try{
    const ids=[...new Set([...hiddenEditingIds,...editorLista.querySelectorAll('input:checked')].map(x=>Number(x.value||x)))];
    await api('/api/acessos/usuarios/'+editingId+'/permissoes',
      {method:'PUT',body:JSON.stringify({permissoes:ids})});
    editorPermissoes.close();msg.textContent='Permissões atualizadas.';
  }catch(err){editorMsg.textContent=err.message;}
  finally{editorSalvar.disabled=false;}
});
(async()=>{
  try{
    const data=await api('/api/acessos/me');
    me=data.usuario;
    if(!data.permissoes.includes('*'))return location.href='/home.html';
    presidente.innerHTML='<strong>'+esc(me.nome)+'</strong>';
    [allPermissions,allCities,allChurches]=await Promise.all([
      api('/api/acessos/permissoes'),api('/api/cidades'),api('/api/congregacoes')]);
    cidadeMinisterial.innerHTML='<option value="">Selecione a cidade</option>'+
      allCities.map(x=>'<option value="'+x.id+'">'+esc(x.nome)+(x.estado?' / '+esc(x.estado):'')+'</option>').join('');
    const requested=new URLSearchParams(location.search).get('cargo');
    if(requested && [...cargo.options].some(o=>o.value===requested))cargo.value=requested;
    changeScope();await loadUsers();
  }catch(err){msg.textContent=err.message;}
})();

cancelarAlteracao.addEventListener('click',()=>{usuarioEditando.value='';formUsuario.reset();formUsuario.senha.required=true;cancelarAlteracao.style.display='none';salvar.textContent='Salvar e liberar acesso';});
