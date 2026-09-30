// CPF: só dígitos, com checagem dos dígitos verificadores
const limparCpf = (v) => String(v || '').replace(/\D/g, '');

function cpfValido(v) {
  const c = limparCpf(v);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(c[i]) * (t + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(c[t])) return false;
  }
  return true;
}

const mascararCpf = (c) => (c && c.length === 11 ? `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**` : null);

module.exports = { limparCpf, cpfValido, mascararCpf };
