/* IDE+ — Nível 1: somente resultados e liberação de gestores N2 */
(() => {
  'use strict';

  const permitidas = new Set(['inicio', 'estrutura', 'perfil']);
  const ehNivel1 = () => (document.getElementById('nivel-selo')?.textContent || '').trim().startsWith('Nível 1');

  function protegerRota() {
    if (!ehNivel1()) return;
    const rota = (location.hash || '#inicio').slice(1);
    if (!permitidas.has(rota)) location.replace(location.pathname + location.search + '#inicio');
  }

  function ajustarMenu() {
    if (!ehNivel1()) return;
    const menu = document.getElementById('menu');
    if (!menu) return;
    menu.querySelectorAll('a[data-rota]').forEach(a => {
      const rota = a.dataset.rota;
      const li = a.closest('li');
      if (!permitidas.has(rota)) li?.remove();
      if (rota === 'estrutura') {
        const rotulo = a.querySelector('.rotulo');
        if (rotulo) rotulo.textContent = 'Gestores Nível 2';
      }
    });
  }

  function ajustarTelaGestores() {
    if (!ehNivel1() || location.hash !== '#estrutura') return;
    const c = document.getElementById('conteudo');
    if (!c) return;
    const h1 = c.querySelector('.cabecalho h1');
    if (!h1 || h1.textContent.trim() !== 'Estrutura') return;

    h1.textContent = 'Gestores Nível 2';
    const sub = h1.parentElement?.querySelector('p');
    if (sub) sub.textContent = 'Libere e acompanhe os Pastores Locais responsáveis por cada cidade. O Nível 1 não executa trabalhos de discipulado.';

    c.querySelector('#nova-cidade')?.remove();
    c.querySelector('#editar-den')?.remove();

    // O primeiro painel desta tela é a identidade/plano da denominação; não faz parte da liberação de gestores.
    const primeiroPainel = c.querySelector(':scope > section.painel');
    if (primeiroPainel) primeiroPainel.remove();

    c.querySelectorAll('article.cidade').forEach(card => {
      const listaCongregacoes = card.querySelector('ul.congs');
      if (listaCongregacoes) listaCongregacoes.remove();
      card.querySelector('.add-cong')?.remove();

      const acoes = card.querySelector('header .acoes');
      if (acoes) {
        acoes.querySelectorAll('[data-ex-cid]').forEach(b => b.remove());
        const editar = acoes.querySelector('[data-ed-cid]');
        if (editar) editar.textContent = 'Liberar / trocar gestor';
      }
    });
  }

  function aplicar() {
    if (!ehNivel1()) return;
    protegerRota();
    ajustarMenu();
    ajustarTelaGestores();
  }

  // O app monta menu e telas de forma assíncrona; observa apenas para aplicar a regra assim que o conteúdo chegar.
  const obs = new MutationObserver(() => aplicar());
  obs.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('hashchange', () => setTimeout(aplicar, 0));
  window.addEventListener('pageshow', aplicar);
  setTimeout(aplicar, 0);
})();
