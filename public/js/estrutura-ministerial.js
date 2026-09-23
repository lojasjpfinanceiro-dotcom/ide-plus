const token=localStorage.getItem('ide_token');
if(!token)location.href='/';
const base='/api/estrutura-ministerial';
const headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let permissions=new Set(),categories=[],types=[],plans=[],lessons=[],selectedPlan=null;
let modulo='CAMPANHA';
const permissionFor=(m,edit=false)=>m==='CAMPANHA'?'atividades.'+(edit?'gerenciar':'visualizar'):'discipulado.estrutura.'+(edit?'gerenciar':'visualizar');
const can=code=>permissions.has('*')||permissions.has(code);
async function api(path,options={}){
  const r=await fetch(base+path,{headers,...options});
  if(r.status===401){location.href='/';throw new Error('Sessão expirada.');}
  let data;try{data=await r.json();}catch{throw new Error('O servidor não retornou uma resposta válida.');}
  if(!r.ok)throw new Error(data.erro||'Não foi possível concluir.');
  return data;
}
const area=x=>x.congregacao_id?'Congregação':x.cidade_ministerial_id?'Cidade':'Denominação';
function resetCategory(){
  $('formCategoria').hidden=true;
  $('formCategoria').reset();$('categoriaId').value='';$('salvarCategoria').textContent='Gravar categoria';
}
function resetType(){
  $('formTipo').hidden=true;
  $('formTipo').reset();$('tipoId').value='';$('salvarTipo').textContent='Gravar tipo';
}
function resetPlan(){
  $('formPlano').hidden=true;
  $('formPlano').reset();$('planoId').value='';$('salvarPlano').textContent='Gravar plano';
}
function resetLesson(){
  $('formAula').hidden=true;
  $('formAula').reset();$('aulaId').value='';
  $('aulaOrdem').value=lessons.length?Math.max(...lessons.map(x=>x.ordem))+1:1;
  $('salvarAula').textContent='Gravar aula';
}
$('limparCategoria').onclick=resetCategory;
$('limparTipo').onclick=resetType;
$('limparPlano').onclick=resetPlan;
$('limparAula').onclick=resetLesson;
for(const [botao,form,reset] of [
  ['novaCategoria','formCategoria',resetCategory],['novoTipo','formTipo',resetType],
  ['novoPlano','formPlano',resetPlan],['novaAula','formAula',resetLesson]
])$(botao).onclick=()=>{reset();$(form).hidden=false;$(form).scrollIntoView({behavior:'smooth',block:'nearest'});};
async function loadCategories(){
  categories=await api('/categorias?modulo='+modulo);
  $('listaCategorias').innerHTML=categories.length?categories.map(x=>
    '<div class="ministry-item"><div class="item-info"><strong>'+esc(x.nome)+'</strong>'+
    '<small>'+esc(area(x))+'</small>'+
    (x.descricao?'<p>'+esc(x.descricao)+'</p>':'')+'</div>'+
    (x.pode_editar&&can(permissionFor(modulo,true))?
      '<div class="item-actions"><button type="button" data-category-edit="'+x.id+'">Editar</button>'+
      '<button type="button" class="delete-button" data-category-delete="'+x.id+'">Excluir</button></div>':'')+'</div>'
  ).join(''):'Nenhuma categoria cadastrada neste módulo.';
  $('tipoCategoria').innerHTML='<option value="">Selecione a categoria</option>'+
    categories.map(x=>'<option value="'+x.id+'">'+esc(x.nome)+' • '+esc(area(x))+'</option>').join('');
  $('novoTipo').hidden=!categories.length||!can(permissionFor(modulo,true));
  if(!categories.length)$('formTipo').hidden=true;
}
async function loadTypes(){
  types=await api('/tipos?modulo='+modulo);
  $('listaTipos').innerHTML=types.length?types.map(x=>
    '<div class="ministry-item"><div class="item-info"><strong>'+esc(x.nome)+'</strong>'+
    '<small>'+esc(x.categoria_nome)+' • '+esc(area(x))+'</small>'+
    (x.descricao?'<p>'+esc(x.descricao)+'</p>':'')+'</div>'+
    (x.pode_editar&&can(permissionFor(modulo,true))?
      '<div class="item-actions"><button type="button" data-type-edit="'+x.id+'">Editar</button>'+
      '<button type="button" class="delete-button" data-type-delete="'+x.id+'">Excluir</button></div>':'')+'</div>'
  ).join(''):'Nenhum tipo cadastrado neste módulo.';
}
async function loadCatalog(){
  resetCategory();resetType();resetPlan();resetLesson();
  $('msgCategoria').textContent='';$('msgTipo').textContent='';
  document.querySelectorAll('.moduloNome').forEach(x=>x.textContent=modulo==='CAMPANHA'?'Campanha':'Discipulado');
  $('areaCategorias').hidden=!can(permissionFor(modulo));
  $('areaTipos').hidden=!can(permissionFor(modulo));
  $('formCategoria').hidden=true;
  $('novaCategoria').hidden=!can(permissionFor(modulo,true));
  $('areaPlanos').hidden=modulo!=='DISCIPULADO'||!can('discipulado.estrutura.visualizar');
  $('novoPlano').hidden=!can('discipulado.estrutura.gerenciar');
  $('aulasArea').hidden=true;selectedPlan=null;
  if(can(permissionFor(modulo))){await loadCategories();await loadTypes();}
}
$('modulo').addEventListener('change',async()=>{
  modulo=$('modulo').value;
  try{await loadCatalog();}catch(err){$('msgCategoria').textContent=err.message;}
});
async function loadPlans(){
  plans=await api('/planos');
  $('listaPlanos').innerHTML=plans.length?plans.map(x=>
    '<div class="ministry-item"><div class="item-info"><strong>'+esc(x.nome)+'</strong>'+
    '<small>'+esc(area(x))+' • '+x.total_aulas+' aula(s)</small>'+
    (x.descricao?'<p>'+esc(x.descricao)+'</p>':'')+'</div>'+
    '<div class="item-actions"><button type="button" data-plan-open="'+x.id+'">Ver aulas</button>'+
    (x.pode_editar&&can('discipulado.estrutura.gerenciar')?
      '<button type="button" data-plan-edit="'+x.id+'">Editar</button>'+
      '<button type="button" class="delete-button" data-plan-delete="'+x.id+'">Excluir</button>':'')+
    '</div></div>'
  ).join(''):'Nenhum plano cadastrado. Crie o primeiro e acrescente suas aulas.';
  if(selectedPlan){
    const p=plans.find(x=>String(x.id)===String(selectedPlan.id));
    if(p)selectedPlan=p;else{selectedPlan=null;$('aulasArea').hidden=true;}
  }
}
async function openPlan(id){
  selectedPlan=plans.find(x=>String(x.id)===String(id));
  if(!selectedPlan)return;
  $('aulasArea').hidden=false;
  $('tituloAulas').textContent='Aulas • '+selectedPlan.nome;
  $('formAula').hidden=true;
  $('novaAula').hidden=!(selectedPlan.pode_editar&&can('discipulado.estrutura.gerenciar'));
  lessons=await api('/planos/'+selectedPlan.id+'/aulas');
  $('listaAulas').innerHTML=lessons.length?lessons.map(x=>
    '<div class="ministry-item"><div class="item-info"><strong>'+x.ordem+'. '+esc(x.titulo)+'</strong>'+
    (x.duracao_minutos?'<small>'+x.duracao_minutos+' min</small>':'')+
    (x.objetivo?'<p><b>Objetivo:</b> '+esc(x.objetivo)+'</p>':'')+
    (x.conteudo?'<p><b>Conteúdo:</b> '+esc(x.conteudo)+'</p>':'')+'</div>'+
    (selectedPlan.pode_editar&&can('discipulado.estrutura.gerenciar')?
      '<div class="item-actions"><button type="button" data-lesson-edit="'+x.id+'">Editar</button>'+
      '<button type="button" class="delete-button" data-lesson-delete="'+x.id+'">Excluir</button></div>':'')+'</div>'
  ).join(''):'Este plano ainda não tem aulas.';
  resetLesson();
  $('aulasArea').scrollIntoView({behavior:'smooth',block:'start'});
}
$('formCategoria').onsubmit=async e=>{
  e.preventDefault();$('salvarCategoria').disabled=true;$('msgCategoria').textContent='Gravando...';
  try{
    const id=$('categoriaId').value,body={modulo,nome:$('categoriaNome').value,
      descricao:$('categoriaDescricao').value};
    await api(id?'/categorias/'+id:'/categorias',
      {method:id?'PUT':'POST',body:JSON.stringify(body)});
    resetCategory();$('msgCategoria').textContent='Categoria gravada.';
    await loadCategories();await loadTypes();
  }catch(err){$('msgCategoria').textContent=err.message;}
  finally{$('salvarCategoria').disabled=false;}
};
$('formTipo').onsubmit=async e=>{
  e.preventDefault();$('salvarTipo').disabled=true;$('msgTipo').textContent='Gravando...';
  try{
    const id=$('tipoId').value,body={categoria_id:$('tipoCategoria').value,
      nome:$('tipoNome').value,descricao:$('tipoDescricao').value};
    await api(id?'/tipos/'+id:'/tipos',{method:id?'PUT':'POST',body:JSON.stringify(body)});
    resetType();$('msgTipo').textContent='Tipo gravado.';await loadTypes();
  }catch(err){$('msgTipo').textContent=err.message;}
  finally{$('salvarTipo').disabled=false;}
};
$('formPlano').onsubmit=async e=>{
  e.preventDefault();$('salvarPlano').disabled=true;$('msgPlano').textContent='Gravando...';
  try{
    const id=$('planoId').value,body={nome:$('planoNome').value,descricao:$('planoDescricao').value};
    await api(id?'/planos/'+id:'/planos',{method:id?'PUT':'POST',body:JSON.stringify(body)});
    resetPlan();$('msgPlano').textContent='Plano gravado.';await loadPlans();
  }catch(err){$('msgPlano').textContent=err.message;}
  finally{$('salvarPlano').disabled=false;}
};
$('formAula').onsubmit=async e=>{
  e.preventDefault();$('salvarAula').disabled=true;$('msgAula').textContent='Gravando...';
  try{
    const id=$('aulaId').value,body={ordem:Number($('aulaOrdem').value),
      titulo:$('aulaTitulo').value,objetivo:$('aulaObjetivo').value,
      conteudo:$('aulaConteudo').value,duracao_minutos:$('aulaDuracao').value||null};
    await api(id?'/aulas/'+id:'/planos/'+selectedPlan.id+'/aulas',
      {method:id?'PUT':'POST',body:JSON.stringify(body)});
    $('msgAula').textContent='Aula gravada.';await loadPlans();await openPlan(selectedPlan.id);
  }catch(err){$('msgAula').textContent=err.message;}
  finally{$('salvarAula').disabled=false;}
};
$('listaCategorias').onclick=async e=>{
  const edit=e.target.closest('[data-category-edit]'),del=e.target.closest('[data-category-delete]');
  if(edit){
    const x=categories.find(x=>String(x.id)===edit.dataset.categoryEdit);
    if(!x)return;
    $('categoriaId').value=x.id;$('categoriaNome').value=x.nome;
    $('categoriaDescricao').value=x.descricao||'';
    $('formCategoria').hidden=false;$('salvarCategoria').textContent='Salvar alteração';
    $('formCategoria').scrollIntoView({behavior:'smooth'});
  }
  if(del&&confirm('Excluir esta categoria? Os tipos vinculados precisam ser excluídos antes.')){
    try{await api('/categorias/'+del.dataset.categoryDelete,{method:'DELETE'});
      await loadCategories();await loadTypes();}
    catch(err){$('msgCategoria').textContent=err.message;}
  }
};
$('listaTipos').onclick=async e=>{
  const edit=e.target.closest('[data-type-edit]'),del=e.target.closest('[data-type-delete]');
  if(edit){
    const x=types.find(x=>String(x.id)===edit.dataset.typeEdit);
    if(!x)return;
    $('tipoId').value=x.id;$('tipoCategoria').value=String(x.categoria_id);
    $('tipoNome').value=x.nome;$('tipoDescricao').value=x.descricao||'';
    $('formTipo').hidden=false;$('salvarTipo').textContent='Salvar alteração';$('formTipo').scrollIntoView({behavior:'smooth'});
  }
  if(del&&confirm('Excluir este tipo?')){
    try{await api('/tipos/'+del.dataset.typeDelete,{method:'DELETE'});await loadTypes();}
    catch(err){$('msgTipo').textContent=err.message;}
  }
};
$('listaPlanos').onclick=async e=>{
  const open=e.target.closest('[data-plan-open]'),edit=e.target.closest('[data-plan-edit]'),
    del=e.target.closest('[data-plan-delete]');
  try{
    if(open)await openPlan(open.dataset.planOpen);
    if(edit){
      const x=plans.find(x=>String(x.id)===edit.dataset.planEdit);
      if(!x)return;
      $('planoId').value=x.id;$('planoNome').value=x.nome;$('planoDescricao').value=x.descricao||'';
      $('formPlano').hidden=false;$('salvarPlano').textContent='Salvar alteração';$('formPlano').scrollIntoView({behavior:'smooth'});
    }
    if(del&&confirm('Excluir este plano e ocultar suas aulas?')){
      await api('/planos/'+del.dataset.planDelete,{method:'DELETE'});await loadPlans();
    }
  }catch(err){$('msgPlano').textContent=err.message;}
};
$('listaAulas').onclick=async e=>{
  const edit=e.target.closest('[data-lesson-edit]'),del=e.target.closest('[data-lesson-delete]');
  if(edit){
    const x=lessons.find(x=>String(x.id)===edit.dataset.lessonEdit);
    if(!x)return;
    $('aulaId').value=x.id;$('aulaOrdem').value=x.ordem;$('aulaTitulo').value=x.titulo;
    $('aulaObjetivo').value=x.objetivo||'';$('aulaConteudo').value=x.conteudo||'';
    $('aulaDuracao').value=x.duracao_minutos||'';
    $('formAula').hidden=false;$('salvarAula').textContent='Salvar alteração';$('formAula').scrollIntoView({behavior:'smooth'});
  }
  if(del&&confirm('Excluir esta aula?')){
    try{await api('/aulas/'+del.dataset.lessonDelete,{method:'DELETE'});
      await loadPlans();await openPlan(selectedPlan.id);}
    catch(err){$('msgAula').textContent=err.message;}
  }
};
(async()=>{
  try{
    const r=await fetch('/api/acessos/me',{headers});
    if(r.status===401)return location.href='/';
    if(!r.ok)throw new Error('Não foi possível carregar seu acesso.');
    const data=await r.json(),u=data.usuario;
    permissions=new Set(data.permissoes);
    const campaignAllowed=can('atividades.visualizar');
    const discipleAllowed=can('discipulado.estrutura.visualizar');
    if(!campaignAllowed&&!discipleAllowed)return location.href='/home.html';
    $('escopoTexto').textContent='Você cria modelos para '+(
      u.escopo==='DENOMINACAO'?'a denominação':u.escopo==='CIDADE'?'a sua cidade':'a sua congregação')+
      '. Os modelos gerais disponíveis também aparecem aqui.';
    $('modulo').querySelector('[value="CAMPANHA"]').hidden=!campaignAllowed;
    $('modulo').querySelector('[value="DISCIPULADO"]').hidden=!discipleAllowed;
    modulo=campaignAllowed?'CAMPANHA':'DISCIPULADO';
    $('modulo').value=modulo;
    await loadCatalog();
    if(discipleAllowed){await loadPlans();}
  }catch(err){$('escopoTexto').textContent=err.message;}
})();
