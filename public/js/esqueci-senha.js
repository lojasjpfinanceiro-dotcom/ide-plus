let resetToken='';

function mensagem(t){document.getElementById('msg').textContent=t||'';}

async function enviarCodigo(){
  const email=document.getElementById('email').value.trim();
  if(!email){mensagem('Informe seu e-mail.');return;}
  mensagem('Enviando código...');
  try{
    const r=await fetch('/api/auth/esqueci-senha',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
    const d=await r.json(); if(!r.ok) throw new Error(d.erro||'Não foi possível enviar o código.');
    document.getElementById('etapaEmail').style.display='none';
    document.getElementById('etapaCodigo').style.display='block';
    mensagem('Código enviado. Confira sua caixa de entrada e, se não encontrar, verifique também a pasta Spam/Lixo eletrônico.');
  }catch(e){mensagem(e.message);}
}

async function confirmarCodigo(){
  const email=document.getElementById('email').value.trim();
  const codigo=document.getElementById('codigo').value.trim();
  if(!/^\d{6}$/.test(codigo)){mensagem('Digite o código de 6 dígitos.');return;}
  mensagem('Confirmando código...');
  try{
    const r=await fetch('/api/auth/confirmar-codigo-senha',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,codigo})});
    const d=await r.json(); if(!r.ok) throw new Error(d.erro||'Código inválido.');
    resetToken=d.resetToken;
    document.getElementById('etapaCodigo').style.display='none';
    document.getElementById('etapaSenha').style.display='block';
    mensagem('Código confirmado. Crie sua nova senha.');
  }catch(e){mensagem(e.message);}
}

async function redefinirSenha(){
  const novaSenha=document.getElementById('novaSenha').value;
  const confirmar=document.getElementById('confirmarSenha').value;
  if(novaSenha.length<8){mensagem('A nova senha precisa ter pelo menos 8 caracteres.');return;}
  if(novaSenha!==confirmar){mensagem('As senhas não coincidem.');return;}
  mensagem('Alterando senha...');
  try{
    const r=await fetch('/api/auth/redefinir-senha',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resetToken,novaSenha})});
    const d=await r.json(); if(!r.ok) throw new Error(d.erro||'Não foi possível alterar a senha.');
    mensagem('Senha alterada com sucesso. Você já pode entrar novamente.');
    setTimeout(()=>location.href='/',1400);
  }catch(e){mensagem(e.message);}
}
