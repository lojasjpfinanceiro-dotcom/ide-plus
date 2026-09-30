/* IDE+ v2 — aplicativo (uma página, rotas por #hash) */
(() => {
  'use strict';

  // ================= Utilidades =================
  const $ = (s, el = document) => el.querySelector(s);
  const h = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // "Pr. João Silva" → "Pr. João"
  const primeiroNome = (n) => {
    const p = String(n || '').trim().split(/\s+/);
    const titulo = /^(pr|pra|pb|ev|eva|dc|dca|diac|miss|bp|bispo|ap|apóstolo|pastor|pastora|irmão|irmã|ir|missionário|missionária|presb)\.?$/i;
    return titulo.test(p[0]) && p[1] ? p[0] + ' ' + p[1] : p[0];
  };
  const iniciais = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const dataBR = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
  const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const NIVEIS = { 0: 'Fornecedor', 1: 'Pastor Presidente', 2: 'Pastor Local', 3: 'Coordenador', 4: 'Líder / Equipe' };
  const STATUS = { CONVERTIDO: 'Novo convertido', DISCIPULADO: 'Em discipulado', BATIZADO: 'Batizado', AFASTADO: 'Afastado' };

  let eu = null;

  async function api(caminho, { metodo = 'GET', corpo } = {}) {
    const pedir = () => fetch('/api' + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(localToken() ? { Authorization: 'Bearer ' + localToken() } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined
    });
    let r;
    try { r = await pedir(); }
    catch {
      // Falha de rede (ex.: "Load failed" no iPhone): tenta mais uma vez antes de avisar
      await new Promise((ok) => setTimeout(ok, 1200));
      try { r = await pedir(); }
      catch { throw new Error('Sem conexão com o servidor. Verifique a internet e tente de novo.'); }
    }
    let dados = null;
    try { dados = await r.json(); } catch { /* sem corpo */ }
    if (r.status === 401 && caminho !== '/auth/login') { sair(); throw new Error(dados?.erro || 'Sessão expirada.'); }
    if (r.status === 403 && dados?.trocar_senha) { trocarSenhaObrigatoria(); throw new Error(dados.erro); }
    if (!r.ok) { const e = new Error(dados?.erro || 'Não foi possível concluir.'); Object.assign(e, dados || {}); throw e; }
    return dados;
  }

  function localToken(v) {
    try {
      if (v === null) return localStorage.removeItem('ide_token');
      if (v) return localStorage.setItem('ide_token', v);
      return localStorage.getItem('ide_token');
    } catch { return window.__ideToken = v === undefined ? window.__ideToken : v; }
  }

  function aviso(msg, erro = false) {
    const el = document.createElement('div');
    el.className = 'aviso' + (erro ? ' erro' : '');
    el.setAttribute('role', 'status');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  // Reduz a imagem no navegador antes de enviar (logo e fotos)
  function reduzirImagem(arquivo, max = 320) {
    return new Promise((ok, falha) => {
      const leitor = new FileReader();
      leitor.onload = () => {
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          ok(c.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = falha;
        img.src = leitor.result;
      };
      leitor.onerror = falha;
      leitor.readAsDataURL(arquivo);
    });
  }

  // CPF: formata enquanto digita (000.000.000-00)
  function formatarCpf(v) {
    const d = String(v).replace(/\D/g, '').slice(0, 11);
    return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }
  function ligarCpf(input, soSeNumero = false) {
    input.addEventListener('input', () => {
      if (soSeNumero && /[^\d.\-\s]/.test(input.value)) return; // e-mail: não formata
      const fim = input.selectionEnd === input.value.length;
      input.value = formatarCpf(input.value);
      if (fim) input.setSelectionRange(input.value.length, input.value.length);
    });
  }

  // Primeiro acesso com senha provisória: não deixa usar o app antes de criar a própria senha
  let trocandoSenha = false;
  function trocarSenhaObrigatoria() {
    if (trocandoSenha) return;
    trocandoSenha = true;
    abrirModal('Crie a sua senha',
      `<p>Você entrou com uma <strong>senha provisória</strong>. Para continuar, crie a sua senha pessoal.</p>
       <form class="form" id="f-troca" novalidate>
         ${campoHtml({ nome: 'senha_nova', rotulo: 'Nova senha', tipo: 'password', obrigatorio: true, auto: 'new-password' })}
         ${campoHtml({ nome: 'senha_conf', rotulo: 'Repita a nova senha', tipo: 'password', obrigatorio: true, auto: 'new-password', exemplo: 'A mesma senha de cima' })}
         <p class="erro-form" id="e-troca" hidden></p>
       </form>`,
      '<button class="botao sec" id="troca-sair" type="button">Sair</button><button class="botao" type="submit" form="f-troca">Salvar e entrar</button>');
    modal.querySelector('[data-fechar]')?.remove();
    modal.addEventListener('cancel', (e) => e.preventDefault());
    $('#troca-sair', modal).onclick = () => { trocandoSenha = false; modal.close(); sair(); };
    $('#f-troca', modal).onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target, erro = $('#e-troca', modal);
      const erroMsg = (m) => { erro.textContent = m; erro.hidden = false; };
      if (f.senha_nova.value.length < 6) return erroMsg('A senha precisa ter ao menos 6 caracteres.');
      if (f.senha_nova.value !== f.senha_conf.value) return erroMsg('As duas senhas não são iguais.');
      try {
        await api('/auth/me', { metodo: 'PUT', corpo: { senha_nova: f.senha_nova.value } });
        trocandoSenha = false; modal.close(); aviso('Senha criada. Bem-vindo ao IDE+!');
        await carregarEu(); $('#tela-login').hidden = true; $('#tela-app').hidden = false; rota();
      } catch (err) { erroMsg(err.message); }
    };
  }

  // ================= Modal e formulários =================
  const modal = $('#modal');

  function abrirModal(titulo, corpoHtml, rodapeHtml) {
    modal.innerHTML = `
      <div class="modal-cab"><h2>${h(titulo)}</h2>
        <button class="botao icone" data-fechar aria-label="Fechar"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="modal-corpo">${corpoHtml}</div>
      ${rodapeHtml ? `<div class="modal-rodape">${rodapeHtml}</div>` : ''}`;
    modal.querySelectorAll('[data-fechar]').forEach((b) => (b.onclick = () => modal.close()));
    if (!modal.open) modal.showModal();
    return modal;
  }

  // Exemplo que aparece dentro do campo e some quando a pessoa digita
  const EXEMPLOS = {
    email: 'nome@email.com', admin_email: 'pastor@email.com',
    senha: 'Mínimo de 6 caracteres', admin_senha: 'Mínimo de 6 caracteres', senha_atual: 'Sua senha de hoje', senha_nova: 'Mínimo de 6 caracteres',
    telefone: '(81) 99999-0000', contato_telefone: '(81) 99999-0000',
    cpf: '123.456.789-09', estado: 'Pernambuco', pais: 'Brasil',
    bairro: 'Centro', endereco: 'Rua das Flores', numero: '120',
    observacao: 'Veio com a esposa; prefere visita à noite',
    admin_nome: 'Pr. José da Silva', contato_nome: 'Pr. José da Silva',
    preco_mensal: '49,90', max_congregacoes: '20', valor: '49,90',
    confirmar: 'EXCLUIR'
  };
  const EXEMPLO_TIPO = {
    COMO_CHEGOU: 'Culto evangelístico', TIPO_TRABALHO: 'Evangelismo de rua',
    TIPO_EVENTO: 'Culto de jovens', TIPO_VISITA: 'Visita no lar'
  };
  const exemploDe = (c) => {
    const ex = c.exemplo ?? EXEMPLOS[c.nome];
    return ex ? ` placeholder="Ex.: ${h(ex)}"` : '';
  };

  function campoHtml(c, v) {
    const val = v ?? c.padrao ?? '';
    const rot = h(c.rotulo) + (c.obrigatorio ? ' <span class="obrig" aria-label="obrigatório">*</span>' : '');
    const cls = c.inteira ? ' inteira' : '';
    const req = c.obrigatorio ? ' required' : '';
    const ajuda = c.ajuda ? `<span class="ajuda">${h(c.ajuda)}</span>` : '';
    switch (c.tipo) {
      case 'select':
        return `<label class="campo${cls}"><span>${rot}</span><select name="${c.nome}"${req}>
          ${c.vazio !== false ? `<option value="">${h(c.vazio || 'Selecione')}</option>` : ''}
          ${(c.opcoes || []).map(([k, t]) => `<option value="${h(k)}"${String(k) === String(val) ? ' selected' : ''}>${h(t)}</option>`).join('')}
        </select>${ajuda}</label>`;
      case 'checkbox':
        return `<label class="check${cls} inteira"><input type="checkbox" name="${c.nome}"${val ? ' checked' : ''}><span>${h(c.rotulo)}${ajuda ? '<br>' + ajuda : ''}</span></label>`;
      case 'textarea':
        return `<label class="campo inteira"><span>${rot}</span><textarea name="${c.nome}"${exemploDe(c)}>${h(val)}</textarea>${ajuda}</label>`;
      case 'imagem':
        return `<div class="campo inteira"><span>${rot}</span><div class="foto-campo">
          ${val ? `<img src="${h(val)}" alt="">` : '<span class="sem-foto">Sem imagem</span>'}
          <label class="botao sec p">${val ? 'Trocar imagem' : 'Escolher imagem'}<input type="file" accept="image/*" data-imagem="${c.nome}"></label>
          <input type="hidden" name="${c.nome}" value="${h(val)}">
          ${val ? `<button type="button" class="botao sec p" data-limpar="${c.nome}">Remover</button>` : ''}
        </div>${ajuda}</div>`;
      default:
        return `<label class="campo${cls}"><span>${rot}</span><input name="${c.nome}" type="${c.tipo || 'text'}" value="${h(val)}"${req}${exemploDe(c)}
          ${c.tipo === 'number' ? ' step="any" inputmode="decimal"' : ''}${c.auto ? ` autocomplete="${c.auto}"` : ''}>${ajuda}</label>`;
    }
  }

  // Abre um formulário e resolve com os valores (ou null se fechar)
  function formulario(titulo, campos, valores = {}, { salvar = 'Salvar', aoSalvar, aoAbrir } = {}) {
    return new Promise((resolver) => {
      abrirModal(titulo,
        `<form class="form cols" id="f-modal" novalidate>${campos.map((c) => campoHtml(c, valores[c.nome])).join('')}
         <p class="erro-form inteira" id="f-erro" hidden></p></form>`,
        `<button class="botao sec" type="button" data-fechar>Cancelar</button><button class="botao" type="submit" form="f-modal">${h(salvar)}</button>`);
      const f = $('#f-modal', modal);
      let concluido = false;

      f.querySelectorAll('[data-imagem]').forEach((inp) => {
        inp.onchange = async () => {
          if (!inp.files[0]) return;
          const url = await reduzirImagem(inp.files[0]);
          f.elements[inp.dataset.imagem].value = url;
          const alvo = inp.closest('.foto-campo').querySelector('img, .sem-foto');
          const img = document.createElement('img'); img.src = url; img.alt = '';
          alvo.replaceWith(img);
        };
      });
      f.querySelectorAll('[data-limpar]').forEach((b) => (b.onclick = () => {
        f.elements[b.dataset.limpar].value = '';
        b.closest('.foto-campo').querySelector('img')?.replaceWith(Object.assign(document.createElement('span'), { className: 'sem-foto', textContent: 'Sem imagem' }));
        b.remove();
      }));

      f.querySelectorAll('input[name=cpf]').forEach((i) => { i.inputMode = 'numeric'; i.value = i.value ? formatarCpf(i.value) : ''; ligarCpf(i); });
      if (aoAbrir) aoAbrir(f);

      f.onsubmit = async (e) => {
        e.preventDefault();
        const dados = {};
        for (const c of campos) {
          const el = f.elements[c.nome];
          if (!el) continue;
          dados[c.nome] = c.tipo === 'checkbox' ? el.checked : el.value.trim();
          if (c.obrigatorio && !dados[c.nome] && c.tipo !== 'checkbox') { mostrarErro(`Preencha o campo obrigatório: ${c.rotulo}.`); el.focus(); el.scrollIntoView({ block: 'center' }); return; }
        }
        const btn = modal.querySelector('button[type=submit]');
        btn.disabled = true;
        try {
          if (aoSalvar) await aoSalvar(dados);
          concluido = true; modal.close(); resolver(dados);
        } catch (err) { mostrarErro(err.message); } finally { btn.disabled = false; }
      };
      function mostrarErro(m) { const p = $('#f-erro', modal); p.textContent = m; p.hidden = false; }
      modal.addEventListener('close', () => { if (!concluido) resolver(null); }, { once: true });
    });
  }

  function confirmar(titulo, texto, { botao = 'Excluir', perigo = true } = {}) {
    return new Promise((ok) => {
      abrirModal(titulo, `<p>${h(texto)}</p>`,
        `<button class="botao sec" data-fechar>Cancelar</button><button class="botao${perigo ? ' perigo' : ''}" id="sim">${h(botao)}</button>`);
      let r = false;
      $('#sim', modal).onclick = () => { r = true; modal.close(); };
      modal.addEventListener('close', () => ok(r), { once: true });
    });
  }

  async function excluir(caminho, nome, depois) {
    if (!(await confirmar('Excluir', `Excluir "${nome}"? Esta ação não pode ser desfeita.`))) return;
    try {
      await api(caminho, { metodo: 'DELETE' });
      aviso('Excluído.'); depois();
    } catch (e) {
      if (e.precisa_confirmar && (await confirmar('Confirmar exclusão', e.message, { botao: 'Excluir tudo' }))) {
        await api(caminho, { metodo: 'DELETE', corpo: { confirmar: true } }); aviso('Excluído.'); depois();
      } else if (!e.precisa_confirmar) aviso(e.message, true);
    }
  }

  const ICO = {
    inicio: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    estrutura: '<rect x="9" y="2.5" width="6" height="5" rx="1"/><path d="M12 7.5v4M5 16.5v-5h14v5"/><rect x="2.5" y="16.5" width="5" height="5" rx="1"/><rect x="9.5" y="16.5" width="5" height="5" rx="1"/><rect x="16.5" y="16.5" width="5" height="5" rx="1"/><path d="M12 11.5v5"/>',
    usuarios: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2.4.6 4 2.3 4 5.2"/>',
    cargos: '<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/>',
    pessoas: '<circle cx="12" cy="7" r="4"/><path d="M5 21v-1a7 7 0 0 1 14 0v1"/>',
    config: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    clientes: '<path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/>',
    planos: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M8 15h3"/>',
    guia: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
    receber: '<path d="M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.5 9 9.5 12 10s5 1.5 5 3.5-2.2 3.5-5 3.5-5-1.1-5-3"/>'
  };
  const ico = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICO[n]}</svg>`;

  // ================= Menu por nível =================
  function menuDoNivel(n) {
    if (n === 0) return [['inicio', 'Início', 'inicio'], ['clientes', 'Clientes', 'clientes'], ['planos', 'Planos', 'planos'], ['recebiveis', 'Recebíveis', 'receber']];
    const m = [['inicio', 'Início', 'inicio']];
    if (n === 1) m.push(['estrutura', 'Estrutura', 'estrutura']);
    if (n === 2) m.push(['estrutura', 'Congregações', 'estrutura']);
    if (n <= 3) m.push(['usuarios', n === 3 ? 'Minha equipe' : 'Usuários', 'usuarios']);
    if (n <= 2) m.push(['cargos', 'Cargos e permissões', 'cargos']);
    m.push(['pessoas', 'Pessoas', 'pessoas']);
    if (n <= 2) m.push(['configuracoes', 'Configurações', 'config']);
    if (n <= 3) m.push(['guia', 'Guia de início', 'guia']);
    return m;
  }

  const VISTAS = {};
  function rota() {
    const r = (location.hash || '#inicio').slice(1);
    const permitidas = menuDoNivel(eu.nivel).map((m) => m[0]).concat('perfil', ...(eu.nivel >= 1 && eu.nivel <= 3 ? ['guia'] : []));
    const alvo = permitidas.includes(r) ? r : 'inicio';
    document.querySelectorAll('.menu a').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === alvo));
    fecharMenu();
    const c = $('#conteudo');
    c.innerHTML = '<p class="vazio">Carregando…</p>';
    Promise.resolve(VISTAS[alvo](c)).catch((e) => { c.innerHTML = `<div class="painel vazio">${h(e.message)}</div>`; });
    window.scrollTo(0, 0);
  }

  function fecharMenu() { $('#lateral').classList.remove('aberta'); $('#veu').hidden = true; }

  // ================= Início =================
  VISTAS.inicio = async (c) => {
    if (eu.nivel === 0) return inicioFornecedor(c);
    const [r, g] = await Promise.all([api('/painel/resumo'), eu.nivel <= 3 ? api('/painel/passos') : Promise.resolve(null)]);
    const f = r.funil, e = r.estrutura;
    const max = Math.max(f.convertidos, 1);
    const titulo = eu.nivel === 1 ? 'Fechamento geral' : `Cidade de ${h(eu.cidade || '')}`;
    const pendente = g && g.total && !g.concluido ? `<div style="margin-bottom:16px">${guiaHtml(g, false)}</div>` : '';
    const meses = r.mensal;
    const topo = Math.max(1, ...meses.map((m) => Math.max(m.convertidos, m.batizados, m.afastados)));

    c.innerHTML = `
      <div class="cabecalho"><div><h1>Olá, ${h(primeiroNome(eu.nome))}</h1><p>${titulo}${eu.nivel === 1 ? ' — sede e todas as cidades' : ''}</p></div>
        ${eu.cidade_id && pode('pessoas.cadastrar') ? '<a class="botao" href="#pessoas" id="novo-conv">Cadastrar convertido</a>' : ''}</div>
      ${pendente}
      <div class="grade duas">
        <section class="painel" aria-labelledby="t-funil">
          <h2 id="t-funil">Do novo convertido ao batismo</h2>
          <div class="funil" style="margin-top:14px">
            <div class="etapa e1"><span class="nome">Novos convertidos</span><span class="num">${f.convertidos}</span><div class="barra"><i style="width:${pct(f.convertidos, max)}%"></i></div></div>
            <div class="etapa e2"><span class="nome">Discipulados</span><span class="num">${f.discipulados}</span><div class="barra"><i style="width:${pct(f.discipulados, max)}%"></i></div><span class="taxa">${pct(f.discipulados, f.convertidos)}% dos convertidos chegaram ao discipulado</span></div>
            <div class="etapa e3"><span class="nome">Batizados</span><span class="num">${f.batizados}</span><div class="barra"><i style="width:${pct(f.batizados, max)}%"></i></div><span class="taxa">${pct(f.batizados, f.discipulados)}% dos discipulados foram batizados</span></div>
            <div class="etapa e4"><span class="nome">Afastados</span><span class="num">${f.afastados}</span><div class="barra"><i style="width:${pct(f.afastados, max)}%"></i></div>
              <span class="taxa">${pct(f.afastados, f.convertidos)}% dos convertidos se afastaram${f.afastados ? ` — ${[
                f.afastados_convertidos ? f.afastados_convertidos + ' antes do discipulado' : '',
                f.afastados_discipulado ? f.afastados_discipulado + ' durante o discipulado' : '',
                f.afastados_batizados ? f.afastados_batizados + ' já batizado(s)' : ''].filter(Boolean).join(', ')}` : ''}</span></div>
          </div>
          <p class="ajuda" style="margin:10px 0 0">Discipulados e batizados contam todos que chegaram à etapa, inclusive os que depois se afastaram. Permanecem hoje: <strong>${f.convertidos - f.afastados}</strong>.</p>
        </section>
        <section class="painel" aria-labelledby="t-meses">
          <h2 id="t-meses">Últimos 12 meses</h2>
          <div class="meses">${meses.map((m) => `<div class="m" title="${m.mes}: ${m.convertidos} convertidos, ${m.batizados} batizados, ${m.afastados} afastados">
            <div class="col">
              <i style="height:${pct(m.convertidos, topo)}%"></i><i class="b" style="height:${pct(m.batizados, topo)}%"></i><i class="a" style="height:${pct(m.afastados, topo)}%"></i></div>
            <small>${MESES[Number(m.mes.slice(5)) - 1]}</small></div>`).join('')}</div>
          <div class="legenda"><span>Convertidos</span><span class="b">Batizados</span><span class="a">Afastados</span></div>
        </section>
      </div>
      <div class="numeros" style="margin-top:16px">
        <div><b>${f.convertidos_mes}</b><span>convertidos este mês</span></div>
        <div><b>${f.batizados_mes}</b><span>batismos este mês</span></div>
        <div><b>${f.afastados_mes}</b><span>afastados este mês</span></div>
        <div><b>${e.congregacoes}</b><span>congregações</span></div>
        <div><b>${e.usuarios}</b><span>usuários</span></div>
      </div>
      ${e.aguardando_responsavel && eu.nivel <= 2 ? `<div class="painel" style="margin-top:16px"><span class="etiqueta laranja">${e.aguardando_responsavel} congregação(ões) aguardando responsável</span> <a href="#estrutura">ver</a></div>` : ''}
      ${r.porCidade.length ? `<section class="painel" style="margin-top:16px"><h2>Por cidade</h2><div class="rolagem"><table class="tabela" style="margin-top:8px">
        <thead><tr><th>Cidade</th><th class="n">Congregações</th><th class="n">Convertidos</th><th class="n">Discipulados</th><th class="n">Batizados</th><th class="n">Afastados</th></tr></thead>
        <tbody>${r.porCidade.map((x) => `<tr><td>${h(x.nome)}/${h(x.estado)} ${x.is_sede ? '<span class="etiqueta verde">Sede</span>' : ''}</td><td class="n">${x.congregacoes}</td><td class="n">${x.convertidos}</td><td class="n">${x.discipulados}</td><td class="n">${x.batizados}</td><td class="n">${x.afastados}</td></tr>`).join('')}
        <tr><td><strong>Total</strong></td><td class="n"><strong>${e.congregacoes}</strong></td><td class="n"><strong>${f.convertidos}</strong></td><td class="n"><strong>${f.discipulados}</strong></td><td class="n"><strong>${f.batizados}</strong></td><td class="n"><strong>${f.afastados}</strong></td></tr></tbody></table></div></section>` : ''}`;
    const novo = $('#novo-conv');
    if (novo) novo.onclick = (ev) => { ev.preventDefault(); location.hash = '#pessoas'; setTimeout(() => editarPessoa(null, () => rota()), 50); };
  };

  // ================= Países, estados e cidades (seleção) =================
  const cacheGeo = {};
  const geo = (tipo, param = '') => (cacheGeo[tipo + param] ??= api(`/geo/${tipo}${param}`).catch((e) => { delete cacheGeo[tipo + param]; throw e; }));

  function preencher(sel, itens, vazio, escolhido) {
    sel.innerHTML = `<option value="">${h(vazio)}</option>` + itens.map(([v, t]) =>
      `<option value="${h(v)}"${String(v) === String(escolhido ?? '') ? ' selected' : ''}>${h(t)}</option>`).join('');
  }

  function ligarGeo(f, atual = {}) {
    const selPais = f.elements.geo_pais, selEst = f.elements.geo_estado, selCid = f.elements.geo_cidade_id;
    async function carregarEstados(escolhido) {
      preencher(selEst, [], 'Carregando…'); preencher(selCid, [], 'Escolha o estado primeiro');
      const estados = await geo('estados', '?pais=' + selPais.value);
      preencher(selEst, estados.map((e) => [e.id, e.nome]), estados.length ? 'Selecione o estado' : 'Sem estados cadastrados', escolhido);
      if (escolhido) await carregarCidades(atual.geo_cidade_id);
    }
    // Campo de busca acima da lista de cidades (no iPhone a lista não aceita digitação)
    const busca = document.createElement('input');
    busca.type = 'search'; busca.placeholder = 'Ex.: Campinas — digite para buscar';
    busca.setAttribute('aria-label', 'Buscar cidade'); busca.disabled = true;
    selCid.before(busca);
    let todas = [];
    const semAcento = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    function filtrar() {
      const q = semAcento(busca.value.trim());
      const lista = q ? todas.filter((c) => semAcento(c.nome).includes(q)) : todas;
      const atualSel = selCid.value;
      preencher(selCid, lista.map((c) => [c.id, c.nome]),
        lista.length ? `Selecione a cidade (${lista.length})` : 'Nenhuma cidade com esse nome', lista.length === 1 ? lista[0].id : atualSel);
    }
    busca.oninput = filtrar;
    async function carregarCidades(escolhido) {
      busca.value = ''; todas = [];
      if (!selEst.value) { busca.disabled = true; return preencher(selCid, [], 'Escolha o estado primeiro'); }
      preencher(selCid, [], 'Carregando cidades…');
      todas = await geo('cidades', '?estado_id=' + selEst.value);
      busca.disabled = false;
      preencher(selCid, todas.map((c) => [c.id, c.nome]), `Selecione a cidade (${todas.length})`, escolhido);
    }
    selPais.onchange = () => carregarEstados();
    selEst.onchange = () => carregarCidades();
    carregarEstados(atual.geo_estado_id).catch((e) => aviso(e.message, true));
  }

  // ================= Primeiros passos =================
  function guiaHtml(g, completo) {
    const bloqueado = (p) => p.depende && !g.passos.find((x) => x.id === p.depende)?.feito;
    return `<section class="painel guia" aria-labelledby="t-guia">
      <div class="cabecalho" style="margin-bottom:6px"><div><h2 id="t-guia">Primeiros passos</h2>
        <p>Siga nesta ordem: cada etapa prepara a seguinte.</p></div>
        <span class="etiqueta ${g.concluido ? 'verde' : ''}">${g.feitos} de ${g.total}</span></div>
      <div class="barra-guia"><i style="width:${pct(g.feitos, g.total)}%"></i></div>
      <ol class="passos">${g.passos.map((p, i) => `
        <li class="${p.feito ? 'feito' : ''}${p.id === g.proximo ? ' proximo' : ''}">
          <span class="marca-passo">${p.feito ? '✓' : i + 1}</span>
          <div class="info"><strong>${h(p.titulo)}${p.opcional ? ' <small class="ajuda">(opcional)</small>' : ''}</strong>
            <small>${h(p.texto)}</small>
            ${!p.feito && bloqueado(p) ? `<small class="ajuda">Depende do passo ${g.passos.findIndex((x) => x.id === p.depende) + 1}.</small>` : ''}</div>
          ${!p.feito && (completo || p.id === g.proximo) ? `<a class="botao p${p.id === g.proximo ? '' : ' sec'}" href="#${p.rota}">Fazer agora</a>` : ''}
        </li>`).join('')}</ol>
      ${!completo ? '<a href="#guia" class="ajuda">Ver o guia completo</a>' : ''}
    </section>`;
  }

  VISTAS.guia = async (c) => {
    const g = await api('/painel/passos');
    c.innerHTML = `<div class="cabecalho"><div><h1>Guia de início</h1><p>A ordem certa para deixar o IDE+ pronto para uso.</p></div></div>
      ${g.total ? guiaHtml(g, true) : '<div class="painel vazio">Não há configurações para o seu nível. Use Pessoas para cadastrar convertidos.</div>'}`;
  };

  // ================= Estrutura (N1: tudo; N2: congregações da sua cidade) =================
  VISTAS.estrutura = async (c) => {
    const [cidades, den, usuarios] = await Promise.all([
      api('/estrutura/cidades'), api('/estrutura/denominacao'),
      eu.nivel <= 2 ? api('/usuarios') : Promise.resolve([])
    ]);
    const pessoasOpc = usuarios.filter((u) => u.ativo).map((u) => [u.id, `${u.nome} — ${NIVEIS[u.nivel]}${u.cargo && u.cargo !== NIVEIS[u.nivel] ? ' (' + u.cargo + ')' : ''}`]);
    // Qualquer usuário da denominação pode ser escolhido como pastor local (presidente, vice, pastores…)
    const pastoresLocais = usuarios.filter((u) => u.ativo).sort((a, b) => a.nivel - b.nivel || a.nome.localeCompare(b.nome))
      .map((u) => [u.id, `${u.nome} — ${u.cargo && u.cargo !== NIVEIS[u.nivel] ? u.cargo : NIVEIS[u.nivel]}`]);
    const n1 = eu.nivel === 1;
    const totalCong = cidades.reduce((s, x) => s + x.congregacoes.length, 0);

    c.innerHTML = `
      <div class="cabecalho"><div><h1>${n1 ? 'Estrutura' : 'Congregações'}</h1>
        <p>${n1 ? 'Denominação, cidades e congregações num só lugar.' : 'As congregações são cadastradas pelo Nível 1. Aqui você define os dirigentes.'}</p></div>
        ${n1 ? '<button class="botao" id="nova-cidade">Nova cidade</button>' : ''}</div>
      ${n1 ? `<section class="painel" style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
        ${den.logo ? `<img src="${h(den.logo)}" alt="" style="width:64px;height:64px;border-radius:12px;object-fit:cover">` : '<div class="logo" style="width:64px;height:64px;border-radius:12px;background:var(--fundo);display:grid;place-items:center;color:var(--suave);font-size:.75rem">Logo</div>'}
        <div style="flex:1;min-width:0"><h2>${h(den.nome)}</h2><small class="ajuda">Plano ${h(den.plano || '—')} · ${totalCong}${den.max_congregacoes ? ' de ' + den.max_congregacoes : ''} congregações</small></div>
        <button class="botao sec p" id="editar-den">Alterar</button></section>` : ''}
      <div id="arvore"></div>`;

    const arv = $('#arvore');
    if (!cidades.length) {
      arv.innerHTML = n1 ? `<div class="painel vazio"><p>Nenhuma cidade ainda. Comece pela cidade da igreja sede.</p><button class="botao" id="primeira">Cadastrar cidade sede</button></div>`
        : '<div class="painel vazio">Sua cidade ainda não foi configurada pelo Nível 1.</div>';
      $('#primeira')?.addEventListener('click', () => editarCidade({ is_sede: true }));
    } else {
      arv.innerHTML = cidades.map((ci) => `
        <article class="cidade">
          <header>
            <div class="info"><h3>${h(ci.nome)} <small>${h(ci.estado)}${ci.pais !== 'Brasil' ? ' · ' + h(ci.pais) : ''}</small> ${ci.is_sede ? '<span class="etiqueta verde">Sede</span>' : ''}</h3>
              <small>${ci.responsavel_nome ? 'Pastor local: ' + h(ci.responsavel_nome) + (ci.responsavel_todas ? ' (responsável por todas)' : '') : 'Sem pastor local'}</small></div>
            ${n1 ? `<div class="acoes"><button class="botao sec p" data-ed-cid="${ci.id}">Alterar</button><button class="botao sec p" data-ex-cid="${ci.id}">Excluir</button></div>` : ''}
          </header>
          <ul class="congs">${ci.congregacoes.map((g) => `
            <li class="${g.aguardando ? 'aguardando' : ''}">
              <div class="info"><strong>${h(g.nome)}</strong> ${g.is_sede ? '<span class="etiqueta">Sede</span>' : ''}
                <br><small>${[
                  g.aguardando ? '<span class="etiqueta laranja">Aguardando responsável</span>' : 'Responsável: ' + h(g.responsavel_efetivo),
                  g.dirigente_nome ? 'Dirigente: ' + h(g.dirigente_nome) : '',
                  g.pessoas + ' pessoa(s)'
                ].filter(Boolean).join(' · ')}</small></div>
              <div class="acoes">
                <button class="botao sec p" data-ed-cong="${g.id}">${n1 ? 'Alterar' : 'Dirigente'}</button>
                ${n1 ? `<button class="botao sec p" data-ex-cong="${g.id}">Excluir</button>` : ''}</div>
            </li>`).join('') || '<li><small class="ajuda">Nenhuma congregação nesta cidade.</small></li>'}
          </ul>
          ${n1 ? `<div class="add-cong"><button class="botao sec p" data-nova-cong="${ci.id}">Adicionar congregação</button></div>` : ''}
        </article>`).join('');
    }

    const acharCid = (id) => cidades.find((x) => String(x.id) === String(id));
    const acharCong = (id) => cidades.flatMap((x) => x.congregacoes).find((g) => String(g.id) === String(id));

    async function editarCidade(ci = {}) {
      const paises = await geo('paises');
      const r = await formulario(ci.id ? 'Alterar cidade' : 'Nova cidade', [
        { nome: 'geo_pais', rotulo: 'País', tipo: 'select', opcoes: paises.map((p) => [p.codigo, p.nome]), vazio: false },
        { nome: 'geo_estado', rotulo: 'Estado', tipo: 'select', opcoes: [], vazio: 'Carregando…', obrigatorio: true },
        { nome: 'geo_cidade_id', rotulo: 'Cidade', tipo: 'select', opcoes: [], vazio: 'Escolha o estado primeiro', obrigatorio: true, inteira: true,
          ajuda: 'Digite no campo de busca para encontrar a cidade mais rápido.' },
        { nome: 'responsavel_id', rotulo: 'Pastor local (responsável)', tipo: 'select', opcoes: pastoresLocais, vazio: 'Sem responsável por enquanto',
          ajuda: 'Aparecem todos os usuários cadastrados (presidente, vice-presidente, pastores…). Na cidade sede, se ninguém for escolhido, o Pastor Presidente fica como pastor local.' },
        { nome: 'responsavel_todas', rotulo: 'Responsável por todas as congregações da cidade', tipo: 'checkbox',
          ajuda: 'Se não marcar, cada congregação fica em laranja até ganhar o seu próprio responsável.' },
        { nome: 'is_sede', rotulo: 'Esta é a cidade da igreja sede', tipo: 'checkbox' }
      ], { ...ci, geo_pais: ci.geo_pais || 'BR' }, {
        aoAbrir: (f) => ligarGeo(f, ci),
        aoSalvar: (d) => api(ci.id ? '/estrutura/cidades/' + ci.id : '/estrutura/cidades', {
          metodo: ci.id ? 'PUT' : 'POST',
          corpo: { geo_cidade_id: Number(d.geo_cidade_id), responsavel_id: d.responsavel_id, responsavel_todas: d.responsavel_todas, is_sede: d.is_sede }
        })
      });
      if (r) { aviso('Cidade salva.'); await carregarEu(); rota(); }
    }

    // Primeira congregação da cidade sede: já sugere "sede" com o Pastor Presidente como responsável
    function novaSede(g, cidadeId) {
      if (g.id) return g;
      const ci = acharCid(cidadeId);
      if (!ci?.is_sede || ci.congregacoes.length) return { cidade_id: cidadeId };
      const presidente = usuarios.find((u) => u.nivel === 1 && String(u.id) === String(eu.id)) || usuarios.find((u) => u.nivel === 1);
      return { cidade_id: cidadeId, is_sede: true, nome: 'Sede', responsavel_id: presidente?.id };
    }

    async function editarCong(g = {}, cidadeId) {
      if (!n1) {
        const r = await formulario(`Dirigente — ${g.nome}`, [
          { nome: 'dirigente_id', rotulo: 'Dirigente da congregação', tipo: 'select', opcoes: pessoasOpc, vazio: 'Sem dirigente' }
        ], g, { aoSalvar: (d) => api('/estrutura/congregacoes/' + g.id, { metodo: 'PUT', corpo: d }) });
        if (r) { aviso('Dirigente salvo.'); rota(); }
        return;
      }
      const r = await formulario(g.id ? 'Alterar congregação' : 'Nova congregação', [
        { nome: 'nome', rotulo: 'Nome da congregação', exemplo: 'Congregação Vila Nova', obrigatorio: true, inteira: true },
        { nome: 'cidade_id', rotulo: 'Cidade', tipo: 'select', opcoes: cidades.map((x) => [x.id, `${x.nome}/${x.estado}`]), vazio: false, obrigatorio: true },
        { nome: 'bairro', rotulo: 'Bairro' },
        { nome: 'endereco', rotulo: 'Endereço', inteira: true },
        { nome: 'responsavel_id', rotulo: 'Responsável da congregação', tipo: 'select', opcoes: pessoasOpc, vazio: 'Usar o pastor da cidade / aguardar' },
        { nome: 'dirigente_id', rotulo: 'Dirigente', tipo: 'select', opcoes: pessoasOpc, vazio: 'Sem dirigente' },
        { nome: 'is_sede', rotulo: 'Congregação sede', tipo: 'checkbox' }
      ], novaSede(g, cidadeId), {
        aoSalvar: (d) => api(g.id ? '/estrutura/congregacoes/' + g.id : '/estrutura/congregacoes', { metodo: g.id ? 'PUT' : 'POST', corpo: d })
      });
      if (r) { aviso('Congregação salva.'); rota(); }
    }

    $('#nova-cidade')?.addEventListener('click', () => editarCidade({ is_sede: !cidades.length }));
    $('#editar-den')?.addEventListener('click', async () => {
      const r = await formulario('Denominação', [
        { nome: 'nome', rotulo: 'Nome da denominação', exemplo: 'Assembleia de Deus Ministério Missão', obrigatorio: true, inteira: true },
        { nome: 'logo', rotulo: 'Logotipo', tipo: 'imagem', ajuda: 'Aparece no topo do app para todos os níveis.' }
      ], den, { aoSalvar: (d) => api('/estrutura/denominacao', { metodo: 'PUT', corpo: d }) });
      if (r) { aviso('Denominação salva.'); await carregarEu(); rota(); }
    });
    arv.onclick = (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.edCid) editarCidade(acharCid(b.dataset.edCid));
      if (b.dataset.exCid) excluir('/estrutura/cidades/' + b.dataset.exCid, acharCid(b.dataset.exCid).nome, async () => { await carregarEu(); rota(); });
      if (b.dataset.novaCong) editarCong({}, b.dataset.novaCong);
      if (b.dataset.edCong) editarCong(acharCong(b.dataset.edCong));
      if (b.dataset.exCong) excluir('/estrutura/congregacoes/' + b.dataset.exCong, acharCong(b.dataset.exCong).nome, rota);
    };
  };

  // ================= Usuários (cadastro único com login e senha) =================
  VISTAS.usuarios = async (c) => {
    const [lista, cargos, cidades] = await Promise.all([
      api('/usuarios'), api('/cargos'), eu.nivel === 1 ? api('/estrutura/cidades') : Promise.resolve([])
    ]);
    const niveisPermitidos = [1, 2, 3, 4].filter((n) => eu.nivel === 1 || n > eu.nivel);
    c.innerHTML = `
      <div class="cabecalho"><div><h1>${eu.nivel === 3 ? 'Minha equipe' : 'Usuários'}</h1>
        <p>Cada pessoa tem um único cadastro com login e senha. Nas cidades e congregações você só vincula quem já está aqui.</p></div>
        <button class="botao" id="novo">Novo usuário</button></div>
      <section class="painel">${lista.length ? `<ul class="lista">${lista.map((u) => `
        <li>${u.foto ? `<img class="avatar p" src="${h(u.foto)}" alt="">` : `<span class="avatar p">${iniciais(u.nome)}</span>`}
          <div class="info"><strong>${h(u.nome)}</strong><small>${NIVEIS[u.nivel]}${u.cargo && u.cargo !== NIVEIS[u.nivel] ? ' · ' + h(u.cargo) : ''}${u.cidade ? ' · ' + h(u.cidade) : ''}${u.ativo ? '' : ' · inativo'}</small>
            <small>${u.cpf_mascarado ? 'CPF ' + u.cpf_mascarado : u.email ? h(u.email) : '<span class="etiqueta laranja">sem CPF</span>'}${u.trocar_senha ? ' · <span class="etiqueta">senha provisória</span>' : ''}</small></div>
          <div class="acoes">
            ${u.nivel > 1 && String(u.id) !== String(eu.id) ? `<button class="botao sec p" data-perm="${u.id}">Acessos</button>` : ''}
            <button class="botao sec p" data-ed="${u.id}">Alterar</button>
            ${String(u.id) !== String(eu.id) ? `<button class="botao sec p" data-ex="${u.id}">Excluir</button>` : ''}</div></li>`).join('')}</ul>`
        : '<div class="vazio">Nenhum usuário cadastrado ainda.</div>'}</section>`;

    const achar = (id) => lista.find((u) => String(u.id) === String(id));
    async function editar(u = {}) {
      const campos = [
        { nome: 'nome', rotulo: 'Nome', exemplo: 'Maria da Silva Santos', obrigatorio: true },
        { nome: 'cpf', rotulo: 'CPF (login)', inteira: false,
          ajuda: u.id && u.tem_cpf && !u.cpf ? `Cadastrado: ${u.cpf_mascarado}. Deixe em branco para manter.` : 'Quem mora no Brasil entra no sistema com o CPF.' },
        { nome: 'fora_do_brasil', rotulo: 'Mora fora do Brasil (entra com e-mail em vez do CPF)', tipo: 'checkbox' },
        { nome: 'email', rotulo: 'E-mail', tipo: 'email', auto: 'off', ajuda: 'Obrigatório para o Pastor Presidente e para quem mora fora do Brasil.' },
        { nome: 'senha', rotulo: u.id ? 'Nova senha provisória (deixe em branco para manter)' : 'Senha provisória', tipo: 'text', obrigatorio: !u.id, auto: 'off',
          ajuda: 'Passe esta senha para a pessoa. No primeiro acesso ela cria a própria senha.' },
        { nome: 'telefone', rotulo: 'Telefone', tipo: 'tel' },
        { nome: 'nivel', rotulo: 'Nível de acesso', tipo: 'select', opcoes: niveisPermitidos.map((n) => [n, `${n} — ${NIVEIS[n]}`]), obrigatorio: true },
        { nome: 'cargo_id', rotulo: 'Cargo', tipo: 'select', opcoes: cargos.filter((k) => k.ativo).map((k) => [k.id, `${k.nome} (nível ${k.nivel})`]), vazio: 'Sem cargo' }
      ];
      if (eu.nivel === 1) campos.push({ nome: 'cidade_id', rotulo: 'Cidade em que atua', tipo: 'select', opcoes: cidades.map((x) => [x.id, `${x.nome}/${x.estado}`]), vazio: 'Nenhuma ainda', ajuda: 'Para o Pastor Local, a cidade também é definida ao vinculá-lo em Estrutura.' });
      campos.push({ nome: 'foto', rotulo: 'Foto', tipo: 'imagem' });
      if (u.id) campos.push({ nome: 'ativo', rotulo: 'Usuário ativo', tipo: 'checkbox' });
      const r = await formulario(u.id ? 'Alterar usuário' : 'Novo usuário', campos,
        u.id ? u : { nivel: niveisPermitidos[eu.nivel === 1 ? 1 : 0] },
        { aoSalvar: (d) => api(u.id ? '/usuarios/' + u.id : '/usuarios', { metodo: u.id ? 'PUT' : 'POST', corpo: d }) });
      if (r) { aviso('Usuário salvo.'); rota(); }
    }

    $('#novo').onclick = () => editar();
    c.onclick = (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.ed) editar(achar(b.dataset.ed));
      if (b.dataset.ex) excluir('/usuarios/' + b.dataset.ex, achar(b.dataset.ex).nome, rota);
      if (b.dataset.perm) acessosDoUsuario(achar(b.dataset.perm));
    };
  };

  async function acessosDoUsuario(u) {
    const r = await api(`/usuarios/${u.id}/permissoes`);
    let grupo = '';
    const linhas = r.permissoes.map((p) => {
      const g = p.modulo !== grupo ? `<div class="grupo">${h(p.modulo)}</div>` : '';
      grupo = p.modulo;
      const v = p.individual === true ? 'sim' : p.individual === false ? 'nao' : '';
      return `${g}<div class="perm-linha"><span>${h(p.descricao)}<br><small class="ajuda">Padrão: ${p.padrao ? 'tem acesso' : 'sem acesso'}</small></span>
        <select data-cod="${p.codigo}" aria-label="${h(p.descricao)}">
          <option value=""${v === '' ? ' selected' : ''}>Padrão</option>
          <option value="sim"${v === 'sim' ? ' selected' : ''}>Tem acesso</option>
          <option value="nao"${v === 'nao' ? ' selected' : ''}>Sem acesso</option></select></div>`;
    }).join('');
    abrirModal(`Acessos — ${u.nome}`,
      `<p class="ajuda">O padrão vem do nível e do cargo. Marque aqui só o que for diferente para esta pessoa.</p><div class="perms">${linhas}</div>`,
      '<button class="botao sec" data-fechar>Cancelar</button><button class="botao" id="salvar-perm">Salvar acessos</button>');
    $('#salvar-perm', modal).onclick = async () => {
      const lista = [...modal.querySelectorAll('select[data-cod]')].map((s) => ({ codigo: s.dataset.cod, individual: s.value === 'sim' ? true : s.value === 'nao' ? false : null }));
      try { await api(`/usuarios/${u.id}/permissoes`, { metodo: 'PUT', corpo: { permissoes: lista } }); modal.close(); aviso('Acessos salvos.'); }
      catch (e) { aviso(e.message, true); }
    };
  }

  // ================= Cargos e permissões =================
  VISTAS.cargos = async (c) => {
    const [cargos, perms] = await Promise.all([api('/cargos'), api('/cargos/permissoes')]);
    const meus = (k) => eu.nivel === 1 || (!k.padrao && String(k.cidade_id) === String(eu.cidade_id));
    c.innerHTML = `
      <div class="cabecalho"><div><h1>Cargos e permissões</h1>
        <p>Os nomes dos cargos são seus (ex.: Superintendente). Cada cargo define o que as pessoas dele podem fazer.</p></div>
        <button class="botao" id="novo">Novo cargo</button></div>
      <section class="painel">${cargos.length ? `<ul class="lista">${cargos.map((k) => `
        <li><div class="info"><strong>${h(k.nome)}</strong><small>Nível ${k.nivel} — ${NIVEIS[k.nivel]} · ${k.permissoes.length} permissão(ões) · ${k.usuarios} usuário(s)${k.padrao && eu.nivel > 1 ? ' · padrão da denominação' : ''}${k.ativo ? '' : ' · inativo'}</small></div>
          ${meus(k) ? `<div class="acoes"><button class="botao sec p" data-ed="${k.id}">Alterar</button><button class="botao sec p" data-ex="${k.id}">Excluir</button></div>` : ''}</li>`).join('')}</ul>`
        : '<div class="vazio">Nenhum cargo criado. Crie cargos como “Superintendente de Campanhas” ou “Professor”.</div>'}</section>`;

    const achar = (id) => cargos.find((k) => String(k.id) === String(id));
    async function editar(k = { permissoes: [], ativo: true }) {
      const niveis = [1, 2, 3, 4].filter((n) => eu.nivel === 1 || n > eu.nivel);
      const campos = [
        { nome: 'nome', rotulo: 'Nome do cargo', exemplo: 'Superintendente de Campanhas', obrigatorio: true },
        { nome: 'nivel', rotulo: 'Nível', tipo: 'select', opcoes: niveis.map((n) => [n, `${n} — ${NIVEIS[n]}`]), vazio: false },
        ...perms.map((p) => ({ nome: 'p_' + p.codigo, rotulo: `${p.modulo}: ${p.descricao}`, tipo: 'checkbox' })),
        ...(k.id ? [{ nome: 'ativo', rotulo: 'Cargo ativo', tipo: 'checkbox' }] : [])
      ];
      const valores = { ...k, nivel: k.nivel || niveis[niveis.length > 1 ? 1 : 0] };
      k.permissoes.forEach((cod) => (valores['p_' + cod] = true));
      const r = await formulario(k.id ? 'Alterar cargo' : 'Novo cargo', campos, valores, {
        aoSalvar: (d) => {
          const corpo = { nome: d.nome, nivel: Number(d.nivel), ativo: d.ativo !== false, permissoes: perms.filter((p) => d['p_' + p.codigo]).map((p) => p.codigo) };
          return api(k.id ? '/cargos/' + k.id : '/cargos', { metodo: k.id ? 'PUT' : 'POST', corpo });
        }
      });
      if (r) { aviso('Cargo salvo.'); rota(); }
    }
    $('#novo').onclick = () => editar();
    c.onclick = (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.ed) editar(achar(b.dataset.ed));
      if (b.dataset.ex) excluir('/cargos/' + b.dataset.ex, achar(b.dataset.ex).nome, rota);
    };
  };

  // ================= Pessoas =================
  let filtroStatus = '';
  VISTAS.pessoas = async (c) => {
    c.innerHTML = `
      <div class="cabecalho"><div><h1>Pessoas</h1><p>Convertidos de ${h(eu.cidade || 'sua cidade')}.</p></div>
        ${pode('pessoas.cadastrar') ? '<button class="botao" id="novo">Cadastrar convertido</button>' : ''}</div>
      <div class="filtros"><input type="search" id="busca" placeholder="Buscar por nome, telefone ou CPF" aria-label="Buscar">
        <div class="chips" role="group" aria-label="Filtrar por etapa">
          ${[['', 'Todos'], ['CONVERTIDO', 'Convertidos'], ['DISCIPULADO', 'Em discipulado'], ['BATIZADO', 'Batizados'], ['AFASTADO', 'Afastados']].map(([v, t]) => `<button class="chip${filtroStatus === v ? ' ativo' : ''}" data-st="${v}">${t}</button>`).join('')}
        </div></div>
      <section class="painel" id="lista-p"><p class="vazio">Carregando…</p></section>`;
    let tempo;
    async function carregar() {
      const q = new URLSearchParams({ busca: $('#busca').value, status: filtroStatus });
      const lista = await api('/pessoas?' + q);
      const el = $('#lista-p');
      el.innerHTML = lista.length ? `<ul class="lista">${lista.map((p) => `
        <li>${p.foto ? `<img class="avatar p" src="${h(p.foto)}" alt="">` : `<span class="avatar p" style="background:var(--trigo)">${iniciais(p.nome)}</span>`}
          <div class="info"><strong>${h(p.nome)}</strong><small>${p.congregacao ? h(p.congregacao) + ' · ' : ''}desde ${dataBR(p.data_conversao)}${p.data_batismo ? ' · batizado em ' + dataBR(p.data_batismo) : ''}${p.status === 'AFASTADO' ? ` · afastou-se em ${dataBR(p.data_afastamento)} (estava: ${STATUS[p.etapa_antes_afastar || 'CONVERTIDO'].toLowerCase()})` : ''}</small></div>
          <span class="etiqueta ${p.status}">${STATUS[p.status]}</span>
          <div class="acoes">${temAcoes(p) ? `<button class="botao sec p" data-et="${p.id}">Etapa</button>` : ''}<button class="botao sec p" data-ab="${p.id}">${pode('pessoas.editar') ? 'Alterar' : 'Ver'}</button></div></li>`).join('')}</ul>`
        : `<div class="vazio">Nenhuma pessoa encontrada.${pode('pessoas.cadastrar') && !$('#busca').value ? '<br><button class="botao" id="novo2">Cadastrar o primeiro convertido</button>' : ''}</div>`;
      $('#novo2')?.addEventListener('click', () => editarPessoa(null, carregar));
    }
    $('#busca').oninput = () => { clearTimeout(tempo); tempo = setTimeout(carregar, 300); };
    $('#novo')?.addEventListener('click', () => editarPessoa(null, carregar));
    c.onclick = (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.st !== undefined) { filtroStatus = b.dataset.st; c.querySelectorAll('.chip').forEach((x) => x.classList.toggle('ativo', x === b)); carregar(); }
      if (b.dataset.ab) editarPessoa(b.dataset.ab, carregar);
      if (b.dataset.et) api('/pessoas/' + b.dataset.et).then((p) => acoesPessoa(p, carregar)).catch((e) => aviso(e.message, true));
    };
    await carregar();
  };

  const pode = (cod) => eu.permissoes === null || (eu.permissoes || []).includes(cod);

  async function editarPessoa(id, depois) {
    const [p, cidades, comoChegou] = await Promise.all([
      id ? api('/pessoas/' + id) : Promise.resolve({ autoriza_dados: false }),
      api('/estrutura/cidades'), api('/config?tipo=COMO_CHEGOU&ativos=1')
    ]);
    const minha = cidades.find((x) => String(x.id) === String(eu.cidade_id));
    const congs = (minha?.congregacoes || []).map((g) => [g.id, g.nome]);
    const editavel = id ? pode('pessoas.editar') : pode('pessoas.cadastrar');
    const campos = [
      { nome: 'nome', rotulo: 'Nome completo', exemplo: 'João Carlos Pereira', obrigatorio: true, inteira: true },
      { nome: 'telefone', rotulo: 'Telefone / WhatsApp', tipo: 'tel', obrigatorio: true },
      { nome: 'cpf', rotulo: 'CPF' },
      { nome: 'nascimento', rotulo: 'Nascimento', tipo: 'date' },
      { nome: 'data_conversao', rotulo: 'Data da conversão', tipo: 'date', padrao: new Date().toISOString().slice(0, 10), obrigatorio: true },
      { nome: 'congregacao_id', rotulo: 'Congregação que vai participar', tipo: 'select', opcoes: congs, vazio: congs.length ? 'Selecione' : 'Nenhuma congregação cadastrada', obrigatorio: true },
      { nome: 'como_chegou_id', rotulo: 'Como chegou', tipo: 'select', opcoes: comoChegou.map((i) => [i.id, i.nome]), vazio: comoChegou.length ? 'Selecione' : 'Nenhuma opção configurada', obrigatorio: true,
        ajuda: comoChegou.length ? '' : 'Cadastre as opções em Configurações → Como chegou.' },
      { nome: 'endereco', rotulo: 'Endereço', obrigatorio: true },
      { nome: 'numero', rotulo: 'Número', obrigatorio: true, ajuda: 'Sem número? Escreva S/N.' },
      { nome: 'bairro', rotulo: 'Bairro', obrigatorio: true, inteira: true },
      { nome: 'observacao', rotulo: 'Observação', tipo: 'textarea' },
      { nome: 'foto', rotulo: 'Foto', tipo: 'imagem' },
      { nome: 'autoriza_dados', rotulo: 'A pessoa autorizou o uso dos seus dados pela igreja', tipo: 'checkbox' }
    ];
    if (!editavel) {
      abrirModal(p.nome, `<p><span class="etiqueta ${p.status}">${STATUS[p.status]}</span></p><p>${h(p.telefone || '')}</p><p class="ajuda">Você pode ver, mas não alterar este cadastro.</p>`);
      return;
    }
    const salvo = await formulario(id ? 'Cadastro da pessoa' : 'Cadastrar convertido', campos, p, {
      salvar: id ? 'Salvar alterações' : 'Cadastrar',
      aoSalvar: (d) => api(id ? '/pessoas/' + id : '/pessoas', { metodo: id ? 'PUT' : 'POST', corpo: d })
    });
    if (salvo) { aviso(id ? 'Cadastro atualizado.' : 'Convertido cadastrado.'); depois(); }
  }

  const temAcoes = (p) => pode('pessoas.editar') || pode('pessoas.excluir') || (!['BATIZADO', 'AFASTADO'].includes(p.status) && pode('batismo.registrar'));

  function acoesPessoa(p, depois) {
    const hoje = new Date().toISOString().slice(0, 10);
    const afastado = p.status === 'AFASTADO';
    const botoes = [];
    if (afastado && pode('pessoas.editar')) botoes.push(`<button class="botao" data-st="VOLTOU">Voltou à igreja (retorna para: ${STATUS[p.etapa_antes_afastar || 'CONVERTIDO'].toLowerCase()})</button>`);
    if (!afastado && p.status === 'CONVERTIDO' && pode('pessoas.editar')) botoes.push('<button class="botao" data-st="DISCIPULADO">Iniciar discipulado</button>');
    if (!afastado && p.status !== 'BATIZADO' && pode('batismo.registrar')) botoes.push('<button class="botao" data-st="BATIZADO" style="background:var(--noite)">Registrar batismo</button>');
    if (!afastado && pode('pessoas.editar')) botoes.push('<button class="botao" data-st="AFASTADO" style="background:var(--brasa)">Marcar como afastado</button>');
    if (!afastado && p.status !== 'CONVERTIDO' && pode('pessoas.editar')) botoes.push('<button class="botao sec" data-st="CONVERTIDO">Voltar para novo convertido</button>');
    if (pode('pessoas.excluir')) botoes.push('<button class="botao sec" data-excluir style="color:var(--perigo)">Excluir cadastro</button>');
    if (!botoes.length) return;
    abrirModal(`Etapa de ${p.nome}`,
      `<p>Etapa atual: <span class="etiqueta ${p.status}">${STATUS[p.status]}</span>
        ${afastado ? `<br><small class="ajuda">Afastou-se em ${dataBR(p.data_afastamento)}${p.motivo_afastamento ? ' — ' + h(p.motivo_afastamento) : ''}</small>` : ''}</p>
       ${!afastado && p.status !== 'BATIZADO' && pode('batismo.registrar') ? `<label class="campo">Data do batismo<input type="date" id="data-bat" value="${hoje}"></label>` : ''}
       ${!afastado && pode('pessoas.editar') ? `<details style="margin-top:12px"><summary class="ajuda">Dados do afastamento (se for marcar como afastado)</summary>
          <div class="form" style="margin-top:8px">
            <label class="campo">Data do afastamento<input type="date" id="data-afast" value="${hoje}"></label>
            <label class="campo">Motivo (opcional)<input id="motivo-afast" placeholder="Ex.: mudou de cidade; deixou de frequentar"></label>
          </div></details>` : ''}
       <div class="form" style="margin-top:12px">${botoes.join('')}</div>`);
    modal.querySelectorAll('[data-st]').forEach((b) => (b.onclick = async () => {
      if (b.dataset.st === 'AFASTADO' && !(await new Promise((ok) => ok(confirm(`Marcar ${p.nome} como afastado(a)?`))))) return;
      try {
        await api(`/pessoas/${p.id}/status`, { metodo: 'POST', corpo: {
          status: b.dataset.st, data_batismo: $('#data-bat', modal)?.value,
          data_afastamento: $('#data-afast', modal)?.value, motivo: $('#motivo-afast', modal)?.value } });
        modal.close(); aviso('Etapa atualizada.'); depois();
      } catch (e) { aviso(e.message, true); }
    }));
    $('[data-excluir]', modal)?.addEventListener('click', () => excluir('/pessoas/' + p.id, p.nome, depois));
  }

  // ================= Configurações =================
  VISTAS.configuracoes = async (c) => {
    const tipos = await api('/config/tipos');
    const itens = await api('/config');
    const n1 = eu.nivel === 1;
    c.innerHTML = `
      <div class="cabecalho"><div><h1>Configurações</h1>
        <p>${n1 ? 'O que você define aqui é o padrão de todas as cidades. Cada Pastor Local pode desativar itens e acrescentar os seus.'
          : 'Você recebe o padrão da denominação. Desative o que não usa e acrescente as opções da sua cidade — elas valem para os níveis 3 e 4.'}</p></div></div>
      <div class="grade duas">${Object.entries(tipos).map(([t, nome]) => {
        const lista = itens.filter((i) => i.tipo === t);
        return `<section class="painel"><div class="cabecalho" style="margin-bottom:8px"><h2>${h(nome)}</h2><button class="botao sec p" data-novo="${t}">Adicionar</button></div>
          ${lista.length ? `<ul class="lista">${lista.map((i) => {
            const meu = n1 ? i.padrao : !i.padrao;
            const ativoAqui = n1 ? i.ativo : (i.padrao ? !i.desativado_na_cidade : i.ativo);
            return `<li><div class="info"><strong style="${ativoAqui ? '' : 'opacity:.55;text-decoration:line-through'}">${h(i.nome)}</strong>
              <small>${!n1 && i.padrao ? 'Padrão da denominação' : n1 ? 'Padrão' : 'Da sua cidade'}${ativoAqui ? '' : ' · desativado'}</small></div>
              <div class="acoes">
                <button class="botao sec p" data-alt="${i.id}">${ativoAqui ? 'Desativar' : 'Ativar'}</button>
                ${meu ? `<button class="botao sec p" data-ed="${i.id}">Alterar</button><button class="botao sec p" data-ex="${i.id}">Excluir</button>` : ''}
              </div></li>`;
          }).join('')}</ul>` : '<p class="ajuda">Nenhuma opção ainda.</p>'}</section>`;
      }).join('')}</div>`;

    const achar = (id) => itens.find((i) => String(i.id) === String(id));
    c.onclick = async (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      try {
        if (b.dataset.novo) {
          const r = await formulario('Nova opção — ' + tipos[b.dataset.novo], [{ nome: 'nome', rotulo: 'Nome', exemplo: EXEMPLO_TIPO[b.dataset.novo], obrigatorio: true, inteira: true }], {},
            { aoSalvar: (d) => api('/config', { metodo: 'POST', corpo: { tipo: b.dataset.novo, nome: d.nome } }) });
          if (r) { aviso('Opção adicionada.'); rota(); }
        }
        if (b.dataset.ed) {
          const i = achar(b.dataset.ed);
          const r = await formulario('Alterar opção', [{ nome: 'nome', rotulo: 'Nome', exemplo: EXEMPLO_TIPO[i.tipo], obrigatorio: true, inteira: true }], i,
            { aoSalvar: (d) => api('/config/' + i.id, { metodo: 'PUT', corpo: d }) });
          if (r) { aviso('Opção salva.'); rota(); }
        }
        if (b.dataset.alt) {
          const i = achar(b.dataset.alt);
          if (!n1 && i.padrao) await api(`/config/${i.id}/cidade`, { metodo: 'POST', corpo: { ativo: i.desativado_na_cidade } });
          else await api('/config/' + i.id, { metodo: 'PUT', corpo: { ativo: !i.ativo } });
          rota();
        }
        if (b.dataset.ex) excluir('/config/' + b.dataset.ex, achar(b.dataset.ex).nome, rota);
      } catch (e) { aviso(e.message, true); }
    };
  };

  // ================= Meu perfil =================
  VISTAS.perfil = async (c) => {
    c.innerHTML = `<div class="cabecalho"><div><h1>Meu perfil</h1><p>${h(NIVEIS[eu.nivel])}${eu.cargo ? ' · ' + h(eu.cargo) : ''}${eu.cidade ? ' · ' + h(eu.cidade) : ''}</p></div></div>
      <section class="painel" style="max-width:560px"><form class="form" id="f-perfil">
        ${campoHtml({ nome: 'foto', rotulo: 'Sua foto', tipo: 'imagem', ajuda: 'Aparece no topo do app.' }, eu.foto)}
        ${campoHtml({ nome: 'telefone', rotulo: 'Telefone', tipo: 'tel' }, eu.telefone)}
        <label class="campo">${eu.cpf ? 'CPF (login)' : 'E-mail (login)'}<input value="${h(eu.cpf || eu.email || '')}" disabled></label>
        <h3 style="margin-top:8px">Trocar senha</h3>
        ${campoHtml({ nome: 'senha_atual', rotulo: 'Senha atual', tipo: 'password', auto: 'current-password' })}
        ${campoHtml({ nome: 'senha_nova', rotulo: 'Nova senha', tipo: 'password', auto: 'new-password' })}
        <button class="botao" type="submit">Salvar perfil</button></form></section>`;
    const f = $('#f-perfil');
    f.querySelector('[data-imagem]').onchange = async (e) => {
      const url = await reduzirImagem(e.target.files[0]);
      f.elements.foto.value = url;
      const alvo = f.querySelector('.foto-campo img, .foto-campo .sem-foto');
      const img = document.createElement('img'); img.src = url; img.alt = ''; alvo.replaceWith(img);
    };
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api('/auth/me', { metodo: 'PUT', corpo: { foto: f.elements.foto.value, telefone: f.elements.telefone.value, senha_atual: f.elements.senha_atual.value, senha_nova: f.elements.senha_nova.value } });
        aviso('Perfil salvo.'); await carregarEu(); rota();
      } catch (err) { aviso(err.message, true); }
    };
  };

  // ================= Nível 0 — Fornecedor =================
  async function inicioFornecedor(c) {
    const r = await api('/fornecedor/resumo');
    c.innerHTML = `<div class="cabecalho"><div><h1>Painel do fornecedor</h1><p>Clientes, planos e recebíveis do IDE+.</p></div>
      <a class="botao" href="#clientes">Novo cliente</a></div>
      <div class="numeros">
        <div><b>${r.clientes_ativos}</b><span>clientes ativos de ${r.clientes}</span></div>
        <div><b>${moeda(r.recebido_mes)}</b><span>recebido este mês</span></div>
        <div><b>${moeda(r.a_receber)}</b><span>a receber</span></div>
        <div><b style="color:${Number(r.vencido) ? 'var(--perigo)' : 'inherit'}">${moeda(r.vencido)}</b><span>vencido</span></div>
      </div>`;
  }

  VISTAS.clientes = async (c) => {
    const [lista, planos] = await Promise.all([api('/fornecedor/clientes'), api('/fornecedor/planos')]);
    c.innerHTML = `<div class="cabecalho"><div><h1>Clientes</h1><p>Cada novo cliente recebe o sistema vazio e o acesso do Pastor Presidente (Nível 1).</p></div>
      <button class="botao" id="novo">Novo cliente</button></div>
      <section class="painel">${lista.length ? `<ul class="lista">${lista.map((d) => `
        <li><div class="info"><strong>${h(d.nome)}</strong><small>${h(d.plano || 'Sem plano')} · ${d.congregacoes} congregações · ${d.usuarios} usuários · ${h(d.email_admin || '')}</small></div>
          <span class="etiqueta ${d.status === 'ATIVO' ? 'verde' : 'laranja'}">${d.status.toLowerCase()}</span>
          <div class="acoes"><button class="botao sec p" data-senha="${d.id}">Senha</button><button class="botao sec p" data-ed="${d.id}">Alterar</button><button class="botao sec p" data-ex="${d.id}">Excluir</button></div></li>`).join('')}</ul>`
        : '<div class="vazio">Nenhum cliente ainda.</div>'}</section>`;
    const opcPlanos = planos.filter((p) => p.ativo).map((p) => [p.id, `${p.nome} — ${moeda(p.preco_mensal)}${p.max_congregacoes ? ' · até ' + p.max_congregacoes + ' congregações' : ''}`]);
    const achar = (id) => lista.find((d) => String(d.id) === String(id));
    $('#novo').onclick = async () => {
      const r = await formulario('Novo cliente', [
        { nome: 'nome', rotulo: 'Denominação', exemplo: 'Igreja Batista Esperança', obrigatorio: true, inteira: true },
        { nome: 'plano_id', rotulo: 'Plano', tipo: 'select', opcoes: opcPlanos, vazio: false },
        { nome: 'contato_telefone', rotulo: 'Telefone de contato', tipo: 'tel' },
        { nome: 'admin_nome', rotulo: 'Nome do Pastor Presidente', obrigatorio: true },
        { nome: 'admin_email', rotulo: 'E-mail de acesso', tipo: 'email', obrigatorio: true, auto: 'off' },
        { nome: 'admin_senha', rotulo: 'Senha inicial', tipo: 'text', obrigatorio: true, auto: 'off', ajuda: 'Envie ao cliente; ele troca em Meu perfil.' }
      ], {}, { salvar: 'Criar cliente', aoSalvar: (d) => api('/fornecedor/clientes', { metodo: 'POST', corpo: d }) });
      if (r) { aviso('Cliente criado.'); rota(); }
    };
    c.onclick = async (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.senha) {
        const d = achar(b.dataset.senha);
        const r = await formulario('Nova senha do Pastor Presidente', [
          { nome: 'senha', rotulo: `Nova senha para ${d.email_admin || d.nome}`, tipo: 'text', obrigatorio: true, inteira: true, auto: 'off', ajuda: 'Envie ao cliente; ele troca em Meu perfil.' }
        ], {}, { salvar: 'Redefinir senha', aoSalvar: (v) => api(`/fornecedor/clientes/${d.id}/senha`, { metodo: 'POST', corpo: v }) });
        if (r) aviso('Senha redefinida.');
      }
      if (b.dataset.ed) {
        const d = achar(b.dataset.ed);
        const r = await formulario('Alterar cliente', [
          { nome: 'nome', rotulo: 'Denominação', exemplo: 'Igreja Batista Esperança', obrigatorio: true, inteira: true },
          { nome: 'plano_id', rotulo: 'Plano', tipo: 'select', opcoes: opcPlanos, vazio: false },
          { nome: 'status', rotulo: 'Situação', tipo: 'select', opcoes: [['ATIVO', 'Ativo'], ['SUSPENSO', 'Suspenso (sem acesso)'], ['CANCELADO', 'Cancelado']], vazio: false },
          { nome: 'contato_nome', rotulo: 'Contato' },
          { nome: 'contato_telefone', rotulo: 'Telefone', tipo: 'tel' }
        ], d, { aoSalvar: (v) => api('/fornecedor/clientes/' + d.id, { metodo: 'PUT', corpo: v }) });
        if (r) { aviso('Cliente salvo.'); rota(); }
      }
      if (b.dataset.ex) {
        const d = achar(b.dataset.ex);
        const r = await formulario('Excluir cliente', [{ nome: 'confirmar', rotulo: `Isso apaga todos os dados de "${d.nome}". Digite EXCLUIR para confirmar.`, obrigatorio: true, inteira: true }], {},
          { salvar: 'Excluir definitivamente', aoSalvar: (v) => api('/fornecedor/clientes/' + d.id, { metodo: 'DELETE', corpo: v }) });
        if (r) { aviso('Cliente excluído.'); rota(); }
      }
    };
  };

  VISTAS.planos = async (c) => {
    const lista = await api('/fornecedor/planos');
    c.innerHTML = `<div class="cabecalho"><div><h1>Planos</h1><p>Preço mensal e limite de congregações de cada plano.</p></div><button class="botao" id="novo">Novo plano</button></div>
      <section class="painel"><ul class="lista">${lista.map((p) => `
        <li><div class="info"><strong>${h(p.nome)}</strong><small>${moeda(p.preco_mensal)}/mês · ${p.max_congregacoes ? 'até ' + p.max_congregacoes + ' congregações' : 'congregações ilimitadas'} · ${p.clientes} cliente(s)${p.ativo ? '' : ' · inativo'}</small></div>
          <div class="acoes"><button class="botao sec p" data-ed="${p.id}">Alterar</button><button class="botao sec p" data-ex="${p.id}">Excluir</button></div></li>`).join('')}</ul></section>`;
    const campos = (id) => [
      { nome: 'nome', rotulo: 'Nome do plano', exemplo: 'Plano Igreja', obrigatorio: true },
      { nome: 'preco_mensal', rotulo: 'Preço mensal (R$)', tipo: 'number' },
      { nome: 'max_congregacoes', rotulo: 'Máximo de congregações', tipo: 'number', ajuda: 'Deixe em branco para ilimitado.' },
      ...(id ? [{ nome: 'ativo', rotulo: 'Plano ativo para novos clientes', tipo: 'checkbox' }] : [])
    ];
    const achar = (id) => lista.find((p) => String(p.id) === String(id));
    $('#novo').onclick = async () => { if (await formulario('Novo plano', campos(), {}, { aoSalvar: (d) => api('/fornecedor/planos', { metodo: 'POST', corpo: d }) })) { aviso('Plano criado.'); rota(); } };
    c.onclick = async (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.ed) { const p = achar(b.dataset.ed); if (await formulario('Alterar plano', campos(p.id), p, { aoSalvar: (d) => api('/fornecedor/planos/' + p.id, { metodo: 'PUT', corpo: d }) })) { aviso('Plano salvo.'); rota(); } }
      if (b.dataset.ex) excluir('/fornecedor/planos/' + b.dataset.ex, achar(b.dataset.ex).nome, rota);
    };
  };

  VISTAS.recebiveis = async (c) => {
    const [lista, clientes] = await Promise.all([api('/fornecedor/cobrancas'), api('/fornecedor/clientes')]);
    c.innerHTML = `<div class="cabecalho"><div><h1>Recebíveis</h1><p>Cobranças mensais dos clientes em planos pagos.</p></div>
      <div class="acoes"><button class="botao sec" id="gerar">Gerar cobranças do mês</button><button class="botao" id="nova">Nova cobrança</button></div></div>
      <section class="painel">${lista.length ? `<div class="rolagem"><table class="tabela"><thead><tr><th>Cliente</th><th>Mês</th><th>Vencimento</th><th class="n">Valor</th><th>Situação</th><th></th></tr></thead><tbody>
        ${lista.map((x) => `<tr><td>${h(x.cliente)}</td><td>${MESES[Number(x.competencia.slice(5, 7)) - 1]}/${x.competencia.slice(0, 4)}</td><td>${dataBR(x.vencimento)}</td><td class="n">${moeda(x.valor)}</td>
          <td><span class="etiqueta ${x.status === 'PAGA' ? 'verde' : x.atrasada ? 'laranja' : ''}">${x.status === 'PAGA' ? 'paga em ' + dataBR(x.pago_em) : x.atrasada ? 'atrasada' : x.status.toLowerCase()}</span></td>
          <td><div class="acoes">${x.status !== 'PAGA' ? `<button class="botao p" data-pagar="${x.id}">Receber</button>` : `<button class="botao sec p" data-abrir="${x.id}">Reabrir</button>`}<button class="botao sec p" data-ex="${x.id}">Excluir</button></div></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="vazio">Nenhuma cobrança. Use “Gerar cobranças do mês” para criar as dos clientes em planos pagos.</div>'}</section>`;
    $('#gerar').onclick = async () => { const r = await api('/fornecedor/cobrancas/gerar', { metodo: 'POST', corpo: {} }); aviso(`${r.geradas} cobrança(s) gerada(s).`); rota(); };
    $('#nova').onclick = async () => {
      const hoje = new Date().toISOString().slice(0, 10);
      if (await formulario('Nova cobrança', [
        { nome: 'denominacao_id', rotulo: 'Cliente', tipo: 'select', opcoes: clientes.map((d) => [d.id, d.nome]), obrigatorio: true, inteira: true },
        { nome: 'competencia', rotulo: 'Mês de referência', tipo: 'date', padrao: hoje, obrigatorio: true },
        { nome: 'vencimento', rotulo: 'Vencimento', tipo: 'date', padrao: hoje, obrigatorio: true },
        { nome: 'valor', rotulo: 'Valor (R$)', tipo: 'number', obrigatorio: true },
        { nome: 'observacao', rotulo: 'Observação', tipo: 'textarea' }
      ], {}, { aoSalvar: (d) => api('/fornecedor/cobrancas', { metodo: 'POST', corpo: d }) })) { aviso('Cobrança criada.'); rota(); }
    };
    c.onclick = async (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      try {
        if (b.dataset.pagar) { await api('/fornecedor/cobrancas/' + b.dataset.pagar, { metodo: 'PUT', corpo: { status: 'PAGA' } }); aviso('Pagamento registrado.'); rota(); }
        if (b.dataset.abrir) { await api('/fornecedor/cobrancas/' + b.dataset.abrir, { metodo: 'PUT', corpo: { status: 'ABERTA' } }); rota(); }
        if (b.dataset.ex) excluir('/fornecedor/cobrancas/' + b.dataset.ex, 'esta cobrança', rota);
      } catch (e) { aviso(e.message, true); }
    };
  };

  // ================= Sessão =================
  async function carregarEu() {
    eu = await api('/auth/me');
    const logo = $('#topo-logo');
    logo.innerHTML = eu.logo ? `<img src="${h(eu.logo)}" alt="" style="width:40px;height:40px;border-radius:10px;object-fit:cover">` : (eu.nivel === 0 ? 'I+' : iniciais(eu.denominacao));
    $('#topo-den').textContent = eu.nivel === 0 ? 'IDE+ · Fornecedor' : eu.denominacao;
    $('#topo-sub').textContent = `${NIVEIS[eu.nivel]}${eu.cidade ? ' · ' + eu.cidade : ''}`;
    const av = $('#topo-avatar');
    av.innerHTML = eu.foto ? `<img src="${h(eu.foto)}" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover">` : iniciais(eu.nome);
    $('#nivel-selo').textContent = `Nível ${eu.nivel} · ${NIVEIS[eu.nivel]}`;
    $('#menu').innerHTML = menuDoNivel(eu.nivel).map(([r, t, i]) => `<li><a href="#${r}" data-rota="${r}">${ico(i)}<span class="rotulo">${t}</span></a></li>`).join('');
  }

  function sair() {
    localToken(null); eu = null;
    $('#tela-app').hidden = true; $('#tela-login').hidden = false;
    if (location.hash) history.replaceState(null, '', location.pathname);
  }

  async function iniciar() {
    if (!localToken()) { $('#tela-login').hidden = false; return; }
    try {
      await carregarEu();
      $('#tela-login').hidden = true; $('#tela-app').hidden = false;
      if (eu.trocar_senha) return trocarSenhaObrigatoria();
      rota();
    } catch { if (!trocandoSenha) sair(); }
  }

  $('#form-login').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, erro = $('#erro-login');
    erro.hidden = true;
    try {
      const r = await api('/auth/login', { metodo: 'POST', corpo: { login: f.login.value, senha: f.senha.value } });
      localToken(r.token); f.reset(); iniciar();
    } catch (err) { erro.textContent = err.message; erro.hidden = false; }
  };
  ligarCpf($('#form-login').login, true);
  $('#sair').onclick = (e) => { e.preventDefault(); sair(); };
  $('#topo-avatar').onclick = () => (location.hash = '#perfil');
  $('#abrir-menu').onclick = () => {
    if (matchMedia('(min-width: 900px)').matches) { $('#tela-app').classList.toggle('recolhido'); return; }
    $('#lateral').classList.add('aberta'); $('#veu').hidden = false;
  };
  $('#veu').onclick = fecharMenu;
  window.addEventListener('hashchange', () => eu && rota());

  // Atualização automática: se houver versão nova publicada, recarrega a página
  let versaoAtual = null;
  async function checarVersao() {
    try {
      const r = await fetch('/api/versao', { cache: 'no-store' });
      const { versao } = await r.json();
      if (versaoAtual && versao !== versaoAtual && !modal.open) {
        aviso('Nova versão do IDE+. Atualizando…');
        setTimeout(() => location.reload(), 900);
      }
      versaoAtual = versaoAtual || versao;
    } catch { /* sem rede: tenta depois */ }
  }
  checarVersao();
  setInterval(checarVersao, 120000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checarVersao(); });

  iniciar();
})();
