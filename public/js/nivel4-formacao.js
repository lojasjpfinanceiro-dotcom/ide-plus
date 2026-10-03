/* IDE+ — Formação do Nível 4
   Mantém os módulos de ensino visíveis mesmo quando o professor ainda não tem turma atribuída. */
(() => {
  'use strict';

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const token = () => { try { return localStorage.getItem('ide_token'); } catch { return null; } };

  async function api(path) {
    const r = await fetch('/api' + path, { headers: token() ? { Authorization: 'Bearer ' + token() } : {} });
    if (!r.ok) throw new Error('Não foi possível carregar a formação.');
    return r.json();
  }

  const modulos = [
    ['planejamento','Planejamento','Organização do curso, calendário e próximas aulas.'],
    ['cursos','Cursos / Planos','Currículos disponíveis para a formação.'],
    ['modulos','Módulos','Etapas e conteúdos do curso.'],
    ['aulas','Aulas','Presencial, live, slides, vídeo, PDF, áudio e estudo.'],
    ['materiais','Materiais','Slides, vídeos, PDFs, áudios e materiais complementares.'],
    ['atividades','Atividades','Exercícios e atividades de cada módulo.'],
    ['avaliacoes','Avaliações / Provas','Questões, provas, notas, tentativas e recuperação.'],
    ['frequencia','Frequência','Chamada e presença dos alunos.'],
    ['progresso','Progresso','Acompanhamento individual e evolução da turma.'],
    ['conclusao','Conclusão','Pendências e alunos aptos para concluir.'],
    ['diplomas','Diplomas','Conclusões e certificados da formação.']
  ];

  function estilo() {
    if (document.getElementById('nivel4-formacao-css')) return;
    const s = document.createElement('style');
    s.id = 'nivel4-formacao-css';
    s.textContent = `
      .formacao-n4{margin:18px 0 0}.formacao-n4 h2{margin:0 0 5px}.formacao-n4>p{margin:0 0 14px}
      .formacao-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .formacao-card{display:flex;flex-direction:column;gap:6px;min-height:122px;text-align:left;cursor:pointer}
      .formacao-card strong{font-size:1.03rem}.formacao-card small{line-height:1.35}.formacao-card .etiqueta{align-self:flex-start;margin-top:auto}
      .formacao-curriculos{margin-top:16px}.formacao-curriculos .lista li{align-items:flex-start}
      @media(max-width:620px){.formacao-grid{grid-template-columns:1fr 1fr}.formacao-card{min-height:132px;padding:15px}.formacao-card small{font-size:.82rem}}
      @media(max-width:390px){.formacao-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(s);
  }

  async function melhorarMinhasAulas() {
    if (location.hash !== '#minhas-aulas') return;
    const c = document.getElementById('conteudo');
    if (!c || c.querySelector('.formacao-n4')) return;
    const titulo = c.querySelector('h1');
    if (!titulo || titulo.textContent.trim() !== 'Minhas Aulas') return;

    estilo();
    const bloco = document.createElement('section');
    bloco.className = 'formacao-n4';
    bloco.innerHTML = `<section class="painel"><h2>Formação e aulas</h2><p class="ajuda">A estrutura de ensino fica disponível mesmo antes de uma turma ser atribuída.</p>
      <div class="formacao-grid">${modulos.map(([id,nome,desc]) => `<button type="button" class="painel formacao-card" data-formacao="${id}"><strong>${nome}</strong><small>${desc}</small><span class="etiqueta">Abrir</span></button>`).join('')}</div></section>
      <section class="painel formacao-curriculos"><h2>Cursos e módulos disponíveis</h2><div data-curriculos><p class="vazio">Carregando currículos…</p></div></section>`;

    const gradeTurmas = c.querySelector('.grade.duas');
    if (gradeTurmas) c.insertBefore(bloco, gradeTurmas);
    else c.appendChild(bloco);

    bloco.querySelectorAll('[data-formacao]').forEach(b => b.onclick = () => {
      const id = b.dataset.formacao;
      if (['cursos','modulos','materiais','atividades','avaliacoes'].includes(id)) location.hash = '#discipulado';
      else if (['planejamento','aulas','frequencia','progresso','conclusao','diplomas'].includes(id)) {
        const turma = c.querySelector('[data-turma]');
        if (turma) turma.click();
        else {
          const aviso = document.createElement('div'); aviso.className = 'aviso';
          aviso.textContent = 'Este módulo já está disponível. Os dados da turma aparecerão quando a coordenação atribuir uma turma ao professor.';
          document.body.appendChild(aviso); setTimeout(() => aviso.remove(), 3500);
        }
      }
    });

    try {
      const r = await api('/discipulado/curriculos');
      const alvo = bloco.querySelector('[data-curriculos]');
      if (!r.curriculos?.length) alvo.innerHTML = '<p class="vazio">Nenhum currículo configurado ainda.</p>';
      else alvo.innerHTML = `<ul class="lista">${r.curriculos.map(k => `<li><div class="info"><strong>${esc(k.nome)}</strong><small>${Number(k.modulos||0)} módulo(s) · ${Number(k.licoes||0)} lição(ões)</small></div><button class="botao sec p" data-curso>Ver módulos</button></li>`).join('')}</ul>`;
      alvo.querySelectorAll('[data-curso]').forEach(b => b.onclick = () => { location.hash = '#discipulado'; });
    } catch {
      bloco.querySelector('[data-curriculos]').innerHTML = '<p class="ajuda">Os currículos aparecerão aqui assim que estiverem disponíveis.</p>';
    }
  }

  // Ajuste da ficha: "responsável" deixa de ser pessoa e o plano passa a trabalhar com atividade.
  function melhorarAcompanhamento() {
    const c = document.getElementById('conteudo');
    if (!c) return;
    const h2 = [...c.querySelectorAll('h2')].find(x => x.textContent.trim() === 'Plano de acompanhamento');
    if (!h2) return;
    const painel = h2.closest('.painel');
    if (!painel || painel.dataset.atividadeAjustada) return;
    painel.dataset.atividadeAjustada = '1';
    const dl = painel.querySelector('dl');
    if (dl) {
      const dts = [...dl.querySelectorAll('dt')];
      const resp = dts.find(x => x.textContent.trim() === 'Responsável');
      if (resp) { const dd = resp.nextElementSibling; resp.remove(); dd?.remove(); }
      const acao = dts.find(x => x.textContent.trim() === 'Próxima ação');
      if (acao) acao.textContent = 'Próxima atividade';
    }
    const btn = [...painel.querySelectorAll('button')].find(x => x.textContent.includes('Definir responsável e próxima ação'));
    if (btn) btn.textContent = 'Definir próxima atividade';
  }

  function melhorarModal() {
    const m = document.getElementById('modal');
    if (!m?.open) return;
    const titulo = m.querySelector('h2');
    if (!titulo || titulo.textContent.trim() !== 'Plano de acompanhamento') return;
    const sel = m.querySelector('[name="responsavel_id"]');
    if (sel) sel.closest('label')?.remove();
    const acao = m.querySelector('[name="proxima_acao"]');
    if (acao) {
      const label = acao.closest('label');
      const span = label?.querySelector(':scope > span');
      if (span) span.textContent = 'Próxima atividade';
      acao.placeholder = 'Ex.: Visita, ligação, WhatsApp, aula ou reunião';
    }
    const data = m.querySelector('[name="proxima_acao_data"]');
    if (data) { const span = data.closest('label')?.querySelector(':scope > span'); if (span) span.textContent = 'Data da próxima atividade'; }
  }

  let timer;
  const atualizar = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { melhorarMinhasAulas(); melhorarAcompanhamento(); melhorarModal(); }, 40);
  };
  new MutationObserver(atualizar).observe(document.documentElement, { childList:true, subtree:true });
  window.addEventListener('hashchange', atualizar);
  window.addEventListener('load', atualizar);
  atualizar();
})();