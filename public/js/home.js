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
const cardDiscipulado=document.getElementById('cardDiscipulado');if(cardDiscipulado)cardDiscipulado.onclick=()=>location.href='/discipulado.html';
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
(async()=>{
  try {
    const r=await fetch('/api/acessos/me',{headers:{Authorization:'Bearer '+token}});
    if(r.status===401){localStorage.removeItem('ide_token');location.href='/';return;}
    if(!r.ok)throw new Error('Não foi possível carregar seu acesso.');
    const data=await r.json(),u=data.usuario,p=new Set(data.permissoes);
    const can=code=>p.has('*')||p.has(code);
    const escopoLogin=String(u.escopo||user.escopo||'').toUpperCase();
    const perfilLogin=String(u.perfil||user.perfil||'').toUpperCase();
    const nivel1=escopoLogin==='DENOMINACAO'||['MASTER','PASTOR_PRESIDENTE','ADMIN','ADMINISTRADOR'].includes(perfilLogin);
    if(nivel1){
      document.documentElement.dataset.ideNivel='1';
      const nome=document.getElementById('n1Usuario');if(nome)nome.textContent=u.nome||'Administrador';
      const painel=await fetch('/api/resultados/painel',{headers:{Authorization:'Bearer '+token}});
      if(painel.ok){
        const d=await painel.json(),r=d.resumo||{};
        const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=Number(v||0).toLocaleString('pt-BR')};
        set('n1Paises',(d.paises||[]).length);set('n1Estados',(d.estados||[]).length);set('n1Cidades',r.cidades);set('n1Congregacoes',r.congregacoes);
        const serie=(d.crescimento||[]),total=Math.max(1,...serie.map(x=>Number(x.total||0)));
        const bars=document.getElementById('n1Crescimento');if(bars)bars.innerHTML=serie.length?serie.map(x=>'<div class="n1-bar-wrap"><span class="n1-bar" style="height:'+Math.max(8,Math.round(Number(x.total||0)*130/total))+'px"></span><b>'+Number(x.total||0).toLocaleString('pt-BR')+'</b><br>'+esc(x.ano)+'</div>').join(''):'<div class="n1-empty">Ainda não há histórico anual.</div>';
        const rel=t=>{const ms=Date.now()-new Date(t).getTime(),m=Math.max(0,Math.floor(ms/60000));if(m<1)return'Agora';if(m<60)return m+' min';const h=Math.floor(m/60);if(h<24)return h+' h';const dias=Math.floor(h/24);return dias+' d'};
        const acts=document.getElementById('n1Atividades');if(acts)acts.innerHTML=(d.atividades||[]).length?(d.atividades||[]).map(x=>'<div><i>●</i><span>'+esc(x.descricao)+'</span><time>'+rel(x.criado_em)+'</time></div>').join(''):'<div><i>●</i><span>Nenhuma atividade recente.</span><time></time></div>';
      }
    }
    ola.textContent='Olá, '+u.nome+'!';
    const labels={DENOMINACAO:'toda a denominação',CIDADE:'sua cidade',CONGREGACAO:'sua congregação'};
    contexto.textContent=(user.denominacao||'IDE+')+' • '+(labels[u.escopo]||'acesso limitado');
    const links=[];
    const escopoAtual=String(u.escopo||user.escopo||'').toUpperCase();const perfilAtual=String(u.perfil||user.perfil||'').toUpperCase();const executivo=['DENOMINACAO','CIDADE'].includes(escopoAtual)||['PASTOR_PRESIDENTE','ADMIN','ADMINISTRADOR','PASTOR_LOCAL','GESTOR_LOCAL'].includes(perfilAtual);if(executivo){const pm=document.getElementById('proximosModulos');if(pm)pm.style.display='none';const ori=document.getElementById('orientacao');if(ori)ori.style.display='none';}else{const ex=document.getElementById('executivo');if(ex)ex.style.display='none';}
    if(!executivo&&can('pessoas.visualizar'))links.push(['/pessoas.html','👤 Pessoas']);
    if(!executivo&&can('atividades.visualizar'))links.push(['/estrutura-ministerial.html','📣 Campanhas']);
    if(!executivo&&can('discipulado.estrutura.visualizar'))links.push(['/discipulado.html','📚 Discipulado']);
    if(!executivo&&(can('atividades.visualizar')||can('discipulado.estrutura.visualizar')))links.push(['/agenda.html','📅 Agenda']);
    if(can('cidades.visualizar')||can('congregacoes.visualizar')||can('discipulado.estrutura.visualizar')||p.has('*'))
      links.push(['/configuracao.html','⚙ Configurações']);
    for(const [url,label] of links){
      const a=document.createElement('a');a.href=url;a.textContent=label;
      menu.appendChild(a);
    }
    descricao.textContent=executivo?'Acompanhe em tempo real os resultados da sua área. Os cadastros operacionais ficam com a Coordenação.':p.has('*')?'Configure a estrutura da igreja uma vez e acompanhe pessoas, campanhas e discipulado de forma organizada.':
      'Seu acesso mostra somente as funções e os registros da sua área.';
    if(executivo){
      const executivoEl=document.getElementById('executivo');if(executivoEl)executivoEl.style.display='';
      const rr=await fetch('/api/resultados/painel',{headers:{Authorization:'Bearer '+token}});if(rr.ok){const d=await rr.json(),r=d.resumo||{};const nivelCidade=escopoAtual==='CIDADE';if(nivelCidade){const cidade=(d.cidades||[])[0];const nomeCidade=cidade?.nome||'Sua cidade';const visao=document.querySelector('#executivo>h2');if(visao)visao.textContent=nomeCidade+' — Visão da cidade';const nav=document.getElementById('navegacaoTerritorial');if(nav)nav.style.display='none';document.querySelectorAll('#executivo .dash-grid').forEach(x=>x.style.display='none');const menuDash=document.getElementById('menuDashboard');if(menuDash)menuDash.style.display='none';}const conv=+(r.convertidos||0),disc=+(r.em_discipulado||0),prep=+(r.preparando_batismo||0),bat=+(r.batizados||0);const territorial=document.getElementById('resumoTerritorial'),tituloTerritorial=document.getElementById('tituloTerritorial'),trilhaTerritorial=document.getElementById('trilhaTerritorial');const row=(nome,x,acao='')=>'<tr '+(acao?'data-territorio="'+esc(acao)+'" style="cursor:pointer"':'')+'><td><b>'+esc(nome)+'</b>'+(acao?' <small>›</small>':'')+'</td><td>'+esc(x.cidades??1)+'</td><td>'+esc(x.congregacoes||0)+'</td><td>'+esc(x.alcancados||0)+'</td><td>'+esc(x.convertidos||0)+'</td><td>'+esc(x.em_discipulado||0)+'</td></tr>';const tabela=(rotulo,html)=>'<div style="overflow-x:auto"><table class="dash-table"><thead><tr><th>'+rotulo+'</th><th>Cidades</th><th>Congregações</th><th>Alcançadas</th><th>Discipulados</th><th>Não Discipulados</th><th>Desistidos</th><th>Batizados</th></tr></thead><tbody>'+html+'</tbody></table></div>';function mostrarCidades(pais,estado){const xs=(d.cidades||[]).filter(x=>(!pais||String(x.pais||'Brasil')===pais)&&(!estado||String(x.estado||'Sem região')===estado));tituloTerritorial.textContent='Cidades';trilhaTerritorial.style.display='';trilhaTerritorial.innerHTML='<button type="button" data-voltar="raiz">‹ Voltar</button> '+esc([pais,estado].filter(Boolean).join(' • '));const tabelaCidade=html=>'<div style="overflow-x:auto"><table class="dash-table"><thead><tr><th>Cidade</th><th>Congregações</th><th>Alcançadas</th><th>Discipulados</th><th>Não Discipulados</th><th>Desistidos</th><th>Batizados</th></tr></thead><tbody>'+html+'</tbody></table></div>';const linhaCidade=x=>'<tr '+((+x.congregacoes||0)>0?'data-territorio="cidade|'+esc(pais||'')+'|'+esc(estado||'')+'|'+esc(x.id)+'" style="cursor:pointer"':'')+'><td><b>'+esc(x.nome)+'</b>'+((+x.congregacoes||0)>0?' <small>›</small>':'')+'</td><td>'+esc(x.congregacoes||0)+'</td><td>'+esc(x.alcancados||0)+'</td><td>'+esc(x.convertidos||0)+'</td><td>'+esc(x.em_discipulado||0)+'</td></tr>';territorial.innerHTML=xs.length?tabelaCidade(xs.map(linhaCidade).join('')):'Sem dados.';}function mostrarCongregacoes(cidadeId,pais,estado){const cidade=(d.cidades||[]).find(x=>String(x.id)===String(cidadeId));const xs=(d.congregacoes||[]).filter(x=>String(x.cidade)===String(cidade?.nome||''));if(!cidade||!xs.length)return;tituloTerritorial.textContent='Congregações de '+cidade.nome;trilhaTerritorial.style.display='';trilhaTerritorial.innerHTML='<button type="button" data-voltar-cidades="1">‹ Cidades</button> '+esc(cidade.nome);const html='<div style="overflow-x:auto"><table class="dash-table" style="min-width:620px"><thead><tr><th style="min-width:220px">Congregação</th><th>Alcançadas</th><th>Discipulados</th><th>Não Discipulados</th><th>Desistidos</th><th>Batizados</th></tr></thead><tbody>'+xs.map(x=>'<tr><td style="min-width:220px"><b>'+esc(x.nome)+'</b></td><td>'+esc(x.alcancados||0)+'</td><td>'+esc(x.em_discipulado||0)+'</td><td>'+esc(x.nao_discipulados||0)+'</td><td>'+esc(x.desistidos||0)+'</td><td>'+esc(x.batizados||0)+'</td></tr>').join('')+'</tbody></table></div>';territorial.innerHTML=html;territorial.dataset.pais=pais||'';territorial.dataset.estado=estado||'';}function mostrarEstados(pais){const xs=(d.estados||[]).filter(x=>String(x.pais)===pais);tituloTerritorial.textContent='Estados / regiões';trilhaTerritorial.style.display='';trilhaTerritorial.innerHTML='<button type="button" data-voltar="raiz">‹ Países</button> '+esc(pais);territorial.innerHTML=xs.length?tabela('Estado / região',xs.map(x=>row(x.estado,x,'estado|'+pais+'|'+x.estado)).join('')):'Sem dados.';}function mostrarRaiz(){trilhaTerritorial.style.display='none';if(escopoAtual==='DENOMINACAO'){tituloTerritorial.textContent='Resumo por país';territorial.innerHTML=(d.paises||[]).length?tabela('País',(d.paises||[]).map(x=>row(x.pais,x,'pais|'+x.pais)).join('')):'Sem dados.';}else{const xs=d.cidades||[];tituloTerritorial.textContent='Resumo da sua cidade';territorial.innerHTML=xs.length?tabela('Cidade',xs.map(x=>row(x.nome,x)).join('')):'Sem dados.';}}territorial.onclick=e=>{const t=e.target.closest('[data-territorio]'),v=e.target.closest('[data-voltar]');if(v){mostrarRaiz();return;}if(!t)return;const [tipo,pais,estado]=t.dataset.territorio.split('|');if(tipo==='pais')mostrarEstados(pais);if(tipo==='estado')mostrarCidades(pais,estado);if(tipo==='cidade'){const cidadeId=t.dataset.territorio.split('|')[3];mostrarCongregacoes(cidadeId,pais,estado);}};trilhaTerritorial.onclick=e=>{if(e.target.closest('[data-voltar-cidades]')){mostrarCidades(territorial.dataset.pais,territorial.dataset.estado);return;}if(e.target.closest('[data-voltar]'))mostrarRaiz();};mostrarRaiz();const mp=Math.max(1,...(d.paises||[]).map(x=>+x.convertidos||0));graficoPaises.innerHTML=(d.paises||[]).map(x=>'<div class="dash-bar"><span>'+esc(x.pais)+'</span><i style="width:'+Math.max(2,Math.round((+x.convertidos||0)*100/mp))+'%"></i><b>'+x.convertidos+'</b></div>').join('')||'Sem dados.';const me=Math.max(1,...(d.estados||[]).map(x=>+x.convertidos||0));graficoEstados.innerHTML=(d.estados||[]).map(x=>'<div class="dash-bar"><span>'+esc(x.estado)+'<small> • '+esc(x.pais)+'</small></span><i style="width:'+Math.max(2,Math.round((+x.convertidos||0)*100/me))+'%"></i><b>'+x.convertidos+'</b></div>').join('')||'Sem dados.';const mx=Math.max(1,...d.cidades.map(x=>+x.convertidos||0));graficoCidades.innerHTML=d.cidades.map(x=>'<div class="dash-bar"><span>'+esc(x.nome)+'</span><i style="width:'+Math.max(2,Math.round((+x.convertidos||0)*100/mx))+'%"></i><b>'+x.convertidos+'</b></div>').join('')||'Sem dados.';const jornada=[['Conversões',conv],['Em discipulado',disc],['Preparando batismo',prep],['Batizados',bat]],mj=Math.max(1,...jornada.map(x=>x[1]));graficoJornada.innerHTML=jornada.map(x=>'<div class="dash-bar"><span>'+x[0]+'</span><i style="width:'+Math.max(2,Math.round(x[1]*100/mj))+'%"></i><b>'+x[1]+'</b></div>').join('');const mc=Math.max(1,...d.congregacoes.map(x=>+x.convertidos||0));graficoCongregacoes.innerHTML=d.congregacoes.slice(0,20).map(x=>'<div class="dash-bar"><span>'+esc(x.nome)+'<small> • '+esc(x.cidade)+'</small></span><i style="width:'+Math.max(2,Math.round((+x.convertidos||0)*100/mc))+'%"></i><b>'+x.convertidos+'</b></div>').join('')||'Sem dados.';const md=Math.max(1,...d.cidades.map(x=>+x.em_discipulado||0));graficoDiscipuladoCidade.innerHTML=d.cidades.map(x=>'<div class="dash-bar"><span>'+esc(x.nome)+'</span><i style="width:'+Math.max(2,Math.round((+x.em_discipulado||0)*100/md))+'%"></i><b>'+x.em_discipulado+'</b></div>').join('')||'Sem dados.';}else{const er=await rr.json().catch(()=>({}));document.querySelectorAll('#executivo .dash-bars').forEach(el=>el.innerHTML='<p>Sem dados disponíveis ainda.</p>');contexto.textContent=(contexto.textContent||'')+' • Painel: '+(er.erro||'erro ao carregar');}
    } else if(can('pessoas.visualizar')){
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
