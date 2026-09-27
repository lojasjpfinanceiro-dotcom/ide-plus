const express=require('express');
const {Country,State,City}=require('country-state-city');
const router=express.Router();
const sort=(a,b)=>String(a).localeCompare(String(b),'pt-BR');
router.get('/paises',(req,res)=>{try{res.json(Country.getAllCountries().map(x=>({nome:x.name,codigo:x.isoCode})).sort((a,b)=>sort(a.nome,b.nome)));}catch(e){console.error('GEO paises:',e);res.status(500).json({erro:'Não foi possível carregar os países.'});}});
router.get('/estados',(req,res)=>{try{const codigo=String(req.query.pais||'').trim().toUpperCase();if(!codigo)return res.status(400).json({erro:'Informe o país.'});res.json(State.getStatesOfCountry(codigo).map(x=>({nome:x.name,codigo:x.isoCode})).sort((a,b)=>sort(a.nome,b.nome)));}catch(e){console.error('GEO estados:',e);res.status(500).json({erro:'Não foi possível carregar os estados/regiões.'});}});
router.get('/cidades',(req,res)=>{try{const pais=String(req.query.pais||'').trim().toUpperCase(),estado=String(req.query.estado||'').trim().toUpperCase();if(!pais||!estado)return res.status(400).json({erro:'Informe país e estado/região.'});res.json(City.getCitiesOfState(pais,estado).map(x=>x.name).filter(Boolean).sort(sort));}catch(e){console.error('GEO cidades:',e);res.status(500).json({erro:'Não foi possível carregar as cidades.'});}});
module.exports=router;
