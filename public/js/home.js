const token=localStorage.getItem('ide_token');
if(!token)location.href='/';
const user=JSON.parse(localStorage.getItem('ide_usuario')||'{}');
document.getElementById('sair').onclick=()=>{localStorage.removeItem('ide_token');localStorage.removeItem('ide_usuario');location.href='/';};
abrirSenha.onclick=()=>senhaDialog.showModal();
fecharSenha.onclick=()=>senhaDialog.close();
senhaForm.onsubmit=async e=>{
  e.preventDefault();senhaMsg.textContent='Gravando...';
  const f=new FormData(senhaForm);
  try{
    const r=await fetch('/api/auth/alterar-senha',{method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
      body:JSON.stringify({senhaAtual:f.get('senhaAtual'),novaSenha:f.get('novaSenha')})});
    const d=await r.json();
    if(!r.ok)throw new Error(d.erro||'Erro ao alterar senha.');
    senhaForm.reset();senhaMsg.textContent='Senha alterada com sucesso.';
  }catch(err){senhaMsg.textContent=err.message;}
};
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
(async()=>{
  try {
    const r=await fetch('/api/acessos/me',{headers:{Authorization:'Bearer '+token}});
    if(r.status===401){localStorage.removeItem('ide_token');location.href='/';return;}
    if(!r.ok)throw new Error('Não foi possível carregar seu acesso.');
    const data=await r.json(),u=data.usuario,p=new Set(data.permissoes);
    const can=code=>p.has('*')||p.has(code);
    ola.textContent='Olá, '+u.nome+'!';
    const labels={DENOMINACAO:'toda a denominação',CIDADE:'sua cidade',CONGREGACAO:'sua congregação'};
    contexto.textContent=(user.denominacao||'IDE+')+' • '+(labels[u.escopo]||'acesso limitado');
    const links=[];
    if(can('pessoas.visualizar'))links.push(['/pessoas.html','👤 Pessoas']);
    if(can('cidades.visualizar')||can('congregacoes.visualizar'))
      links.push(['/estrutura.html','🏙 Estrutura']);
    if(can('atividades.visualizar')||can('discipulado.estrutura.visualizar'))
      links.push(['/estrutura-ministerial.html','📚 Estrutura ministerial']);
    if(p.has('*'))links.push(['/usuarios.html','🔐 Usuários e permissões']);
    for(const [url,label] of links){
      const a=document.createElement('a');a.href=url;a.textContent=label;
      menu.appendChild(a);
      const b=document.createElement('button');b.textContent=label;b.onclick=()=>location.href=url;atalhos.appendChild(b);
    }
    descricao.textContent=p.has('*')?'Cadastre cidades e crie os acessos da equipe. Depois acompanhe o trabalho de todas as áreas.':
      'Seu acesso mostra somente as funções e os registros da sua área.';
    if(can('pessoas.visualizar')){
      const summary=await fetch('/api/pessoas/resumo',{headers:{Authorization:'Bearer '+token}});
      if(summary.ok){
        const d=await summary.json();resumoSecao.style.display='';
        kAlcancadas.textContent=d.pessoas_alcancadas||0;
        kDiscipulado.textContent=d.em_discipulado||0;
        kPreparando.textContent=d.preparando_batismo||0;
        kBatizados.textContent=d.batizados_ano||0;
      }
    }
  }catch(e){contexto.textContent=e.message;}
})();
