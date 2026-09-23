const token=localStorage.getItem('ide_token');
if(!token)location.href='/';
const h={'Content-Type':'application/json','Authorization':'Bearer '+token};
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let canCity=false;
async function api(url,options={}){
  const r=await fetch(url,{headers:h,...options});
  if(r.status===401){location.href='/';throw new Error('Sessão expirada.');}
  const d=await r.json();
  if(!r.ok)throw new Error(d.erro||'Erro ao carregar.');
  return d;
}
async function carregar(){
  if(!canCity)return;
  const d=await api('/api/cidades');
  listaCidades.innerHTML=d.length?d.map(x=>'<p><strong>'+esc(x.nome)+(x.estado?' / '+esc(x.estado):'')+
    '</strong><br><button type="button" data-edit="'+x.id+'" data-nome="'+esc(x.nome)+
    '" data-estado="'+esc(x.estado||'')+'">Alterar</button> <button type="button" data-del="'+x.id+
    '">Excluir</button></p>').join(''):'Nenhuma cidade cadastrada.';
}
formCidade.addEventListener('submit',async e=>{
  e.preventDefault();msgCidade.textContent='Gravando...';
  try{
    const id=cidadeEditId.value;
    await api(id?'/api/cidades/'+id:'/api/cidades',{method:id?'PUT':'POST',
      body:JSON.stringify({nome:nomeCidade.value.trim(),estado:estado.value.trim().toUpperCase()})});
    msgCidade.textContent='Cidade gravada com sucesso.';
    formCidade.reset();cidadeEditId.value='';tituloCidade.textContent='Nova cidade';
    await carregar();
  }catch(err){msgCidade.textContent=err.message;}
});
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-edit]');
  if(b){cidadeEditId.value=b.dataset.edit;nomeCidade.value=b.dataset.nome;
    estado.value=b.dataset.estado;tituloCidade.textContent='Alterar cidade';return;}
  const d=e.target.closest('[data-del]');
  if(!d||!confirm('Excluir/desativar esta cidade?'))return;
  try{await api('/api/cidades/'+d.dataset.del,{method:'DELETE'});await carregar();}
  catch(err){alert(err.message);}
});
(async()=>{
  try{
    const data=await api('/api/acessos/me');
    const p=new Set(data.permissoes),u=data.usuario,can=code=>p.has('*')||p.has(code);
    canCity=u.escopo==='DENOMINACAO'&&can('cidades.visualizar');
    if(canCity){
      presidencia.style.display='';
      tituloPagina.textContent='Cidades da Convenção';
      subtituloPagina.textContent='Cadastre cidades; o Pastor Presidente libera os acessos.';
      formCidade.style.display=can('cidades.inserir')?'':'none';
      if(!p.has('*'))presidencia.querySelector('button[onclick]').style.display='none';
      await carregar();
    }else if(can('congregacoes.visualizar')){
      gestaoLocal.style.display='';
      tituloPagina.textContent='Gestão da minha cidade';
      subtituloPagina.textContent='Acompanhe as congregações da sua área.';
    }else location.href='/home.html';
  }catch(err){subtituloPagina.textContent=err.message;}
})();
