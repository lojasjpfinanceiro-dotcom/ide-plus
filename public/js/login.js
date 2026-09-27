const form=document.getElementById('loginBox');
const emailInput=document.getElementById('email');
const senhaInput=document.getElementById('senha');
const msg=document.getElementById('msg');
const btnEntrar=document.getElementById('btnEntrar');
let enviando=false;

form.addEventListener('submit',login);
async function login(e){
  if(e)e.preventDefault();
  if(enviando)return;
  const email=String(emailInput.value||'').trim();
  const senha=String(senhaInput.value||'');
  if(!email||!senha){msg.textContent='Informe e-mail e senha.';return;}
  enviando=true;btnEntrar.disabled=true;btnEntrar.textContent='Entrando...';msg.textContent='';
  try{
    const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,senha})});
    const tipo=r.headers.get('content-type')||'';
    const d=tipo.includes('application/json')?await r.json():{};
    if(!r.ok)throw new Error(d.erro||'Não foi possível entrar. Tente novamente.');
    localStorage.setItem('ide_token',d.token);
    localStorage.setItem('ide_usuario',JSON.stringify(d.usuario));
    window.location.replace('/home.html');
  }catch(err){msg.textContent=err.message||'Não foi possível entrar.';enviando=false;btnEntrar.disabled=false;btnEntrar.textContent='Entrar';}
}
