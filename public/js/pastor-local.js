const token=localStorage.getItem('ide_token');
let atual={};try{atual=JSON.parse(localStorage.getItem('ide_usuario')||'{}')}catch(e){}
if(!token)location.href='/';
const perfil=String(atual.perfil||'').toUpperCase();
if(!['PASTOR_PRESIDENTE','MASTER'].includes(perfil))location.href='/home.html';
const headers={'Content-Type':'application/json','Authorization':'Bearer '+token};
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
presidente.innerHTML='<strong>'+esc(atual.nome||'')+'</strong><br>'+esc(atual.denominacao||'');
btnVoltar.onclick=()=>location.href='/estrutura.html';
cancelar.onclick=btnVoltar.onclick;

async function carregarCidades(){
  const r=await fetch('/api/cidades',{headers});
  if(r.status===401)return location.href='/';
  const d=await r.json();
  if(!r.ok)throw new Error(d.erro||'Erro ao carregar cidades.');
  cidadeMinisterial.innerHTML='<option value="">Selecione a cidade</option>'+d.map(x=>'<option value="'+x.id+'">'+esc(x.nome)+(x.estado?' / '+esc(x.estado):'')+'</option>').join('');
}
async function carregarPastores(){
  const r=await fetch('/api/acessos/usuarios',{headers});
  if(r.status===401)return location.href='/';
  const d=await r.json();
  if(!r.ok)return listaPastores.textContent=d.erro||'Erro ao carregar.';
  const pastores=d.filter(x=>String(x.perfil||'').toUpperCase()==='PASTOR_LOCAL');
  listaPastores.innerHTML=pastores.length?pastores.map(x=>'<p><strong>'+esc(x.nome)+'</strong><br><small>Pastor Local'+(x.cidade?' • '+esc(x.cidade):'')+' • '+esc(x.email)+'</small></p>').join(''):'Nenhum Pastor Local cadastrado.';
}
formPastor.addEventListener('submit',async e=>{
  e.preventDefault();salvar.disabled=true;salvar.textContent='Salvando...';msg.textContent='';
  try{
    const fd=new FormData(formPastor);
    const body={nome:fd.get('nome'),email:fd.get('email'),telefone:fd.get('telefone'),senha:fd.get('senha'),cidade_ministerial_id:Number(fd.get('cidade_ministerial_id'))};
    const r=await fetch('/api/acessos/pastores-locais',{method:'POST',headers,body:JSON.stringify(body)});
    const d=await r.json();
    if(!r.ok)throw new Error(d.erro||'Não foi possível cadastrar.');
    msg.textContent='Pastor Local cadastrado e vinculado à cidade com sucesso.';
    formPastor.reset();await carregarPastores();
  }catch(err){msg.textContent=err.message||'Erro ao cadastrar Pastor Local.'}
  finally{salvar.disabled=false;salvar.textContent='Salvar Pastor Local';}
});
Promise.all([carregarCidades(),carregarPastores()]).catch(e=>msg.textContent=e.message);