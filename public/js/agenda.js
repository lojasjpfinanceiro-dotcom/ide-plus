const token=localStorage.getItem('ide_token');if(!token)location.href='/';const headers={'Content-Type':'application/json',Authorization:'Bearer '+token};let cursor=new Date(),dados=[],selecionado='';const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');async function carregar(){const mes=cursor.getFullYear()+'-'+String(cursor.getMonth()+1).padStart(2,'0');const r=await fetch('/api/agenda?mes='+mes,{headers});dados=r.ok?await r.json():[];render()}function render(){mesTitulo.textContent=cursor.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});calendar.innerHTML=['D','S','T','Q','Q','S','S'].map(x=>'<div class="dow">'+x+'</div>').join('');const first=new Date(cursor.getFullYear(),cursor.getMonth(),1),last=new Date(cursor.getFullYear(),cursor.getMonth()+1,0);for(let i=0;i<first.getDay();i++)calendar.insertAdjacentHTML('beforeend','<div></div>');for(let d=1;d<=last.getDate();d++){const date=ymd(new Date(cursor.getFullYear(),cursor.getMonth(),d)),has=dados.some(x=>String(x.data_evento).slice(0,10)===date);const b=document.createElement('button');b.className='day'+(has?' has':'')+(selecionado===date?' sel':'');b.textContent=d;b.onclick=()=>{selecionado=date;mostrarDia();render()};calendar.appendChild(b)}}function mostrarDia(){diaTitulo.textContent=selecionado?'Programação de '+selecionado.split('-').reverse().join('/'):'Programação';const a=dados.filter(x=>String(x.data_evento).slice(0,10)===selecionado);eventos.innerHTML=a.length?a.map(x=>'<div class="event"><strong>'+esc(x.titulo)+'</strong><br><small>'+esc(x.modulo)+(x.hora_inicio?' • '+esc(String(x.hora_inicio).slice(0,5)):'')+(x.local?' • '+esc(x.local):'')+'</small>'+(x.responsavel?'<br>Responsável: '+esc(x.responsavel):'')+(x.observacoes?'<br>'+esc(x.observacoes):'')+'</div>').join(''):'Nenhuma programação neste dia.'}prev.onclick=()=>{cursor=new Date(cursor.getFullYear(),cursor.getMonth()-1,1);selecionado='';carregar()};next.onclick=()=>{cursor=new Date(cursor.getFullYear(),cursor.getMonth()+1,1);selecionado='';carregar()};async function enviarAgenda(payload){
  let ultimoErro;
  for(let tentativa=1;tentativa<=2;tentativa++){
    try{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),12000);
      try{return await fetch('/api/agenda',{method:'POST',headers,body:JSON.stringify(payload),cache:'no-store',signal:controller.signal});}
      finally{clearTimeout(timer);}
    }catch(err){
      ultimoErro=err;
      if(tentativa<2)await new Promise(r=>setTimeout(r,350));
    }
  }
  throw ultimoErro;
}
formAgenda.onsubmit=async e=>{
  e.preventDefault();
  if(!formAgenda.reportValidity())return;
  const botao=formAgenda.querySelector('button[type="submit"],button.btn');
  const o=Object.fromEntries(new FormData(formAgenda).entries());
  if(botao)botao.disabled=true;
  msg.textContent='Gravando...';
  try{
    const r=await enviarAgenda(o);
    const tipo=r.headers.get('content-type')||'';
    const d=tipo.includes('application/json')?await r.json():{};
    if(!r.ok)throw new Error(d.erro||'Erro ao gravar programação.');
    selecionado=o.data_evento;
    cursor=new Date(o.data_evento+'T12:00:00');
    formAgenda.reset();
    msg.textContent='Programação gravada.';
    await carregar();
    mostrarDia();
  }catch(err){
    console.error('Falha ao gravar agenda:',err);
    msg.textContent=err?.name==='AbortError'?'O servidor demorou para responder. Tente novamente.':(err?.message||'Falha de conexão. Tente novamente.');
  }finally{
    if(botao)botao.disabled=false;
  }
};mobileMenu.onclick=()=>location.href='/home.html';mobilePerfil.onclick=()=>location.href='/home.html';carregar();