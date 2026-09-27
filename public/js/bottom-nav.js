(()=>{
  const token=localStorage.getItem('ide_token');
  if(!token)return;
  const items=[
    ['/home.html','⌂','Início','home.html'],
    ['/pessoas.html','👤','Pessoas','pessoas.html'],
    ['/estrutura-ministerial.html','📣','Campanhas','estrutura-ministerial.html'],
    ['/discipulado.html','📚','Discipulado','discipulado.html'],
    ['/agenda.html','📅','Agenda','agenda.html'],
    ['/configuracao.html','⚙️','Config.','configuracao.html']
  ];
  const path=location.pathname;
  document.querySelectorAll('.mobile-bottom').forEach(el=>el.remove());
  const nav=document.createElement('nav');
  nav.className='ide-bottom-nav';
  nav.setAttribute('aria-label','Navegação principal');
  for(const [href,icon,label,key] of items){
    const a=document.createElement('a');
    a.href=href;
    if(path.endsWith(key)||(key==='home.html'&&(path==='/'||path.endsWith('/home'))))a.classList.add('active');
    a.innerHTML='<span aria-hidden="true">'+icon+'</span><small>'+label+'</small>';
    nav.appendChild(a);
  }
  document.body.appendChild(nav);
})();