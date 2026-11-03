'use strict';
const menu=document.getElementById('menu'), links=document.getElementById('links');
if(menu&&links){menu.addEventListener('click',()=>{const open=links.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));});
links.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{links.classList.remove('open');menu.setAttribute('aria-expanded','false')}));}
const yr=document.getElementById('year');if(yr)yr.textContent=new Date().getFullYear();
const demoData={
 proxy:{title:'Proxy configuration',rows:[['Proxy type','HTTP / HTTPS / SOCKS5'],['Credentials','Optional'],['Connection test','Round-trip check'],['Applied to','Selected profile']]},
 fingerprint:{title:'Fingerprint settings',rows:[['Navigator','User agent, platform, language'],['Display','Screen size & device preset'],['Environment','Fonts, hardware & media'],['Location','Timezone & geolocation']]},
 check:{title:'Fingerprint check',rows:[['Browser state','Profile launched'],['Inspection','Selected browser properties'],['Diagnostics','External test pages'],['Next step','Review and refine settings']]}
};
document.querySelectorAll('.demo-tab').forEach(tab=>tab.addEventListener('click',()=>{
 document.querySelectorAll('.demo-tab').forEach(t=>{t.classList.remove('active');t.setAttribute('aria-selected','false')});
 tab.classList.add('active');tab.setAttribute('aria-selected','true');
 const d=demoData[tab.dataset.demo];document.getElementById('demoTitle').textContent=d.title;
 document.getElementById('demoBody').innerHTML=d.rows.map(r=>'<div class="demo-kv"><span>'+r[0]+'</span><b>'+r[1]+'</b></div>').join('');
}));

(function(){
 const pf=document.getElementById('partner-form');
 if(!pf)return;
 const st=pf.querySelector('.pp-status'),btn=pf.querySelector('button[type="submit"]');
 pf.addEventListener('submit',async function(e){
  e.preventDefault();
  if(!pf.checkValidity()){pf.reportValidity();return}
  const d=Object.fromEntries(new FormData(pf).entries());
  if(d.company_website)return;
  btn.disabled=true;st.className='pp-status';st.textContent='Sending…';
  try{
   const r=await fetch(pf.dataset.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:d.name,email:d.email,country:d.country,channel_url:d.channel_url||'',promotion_plan:d.promotion_plan})});
   if(!r.ok){let m='';try{m=(await r.json()).message||''}catch(x){}throw new Error(m||'HTTP '+r.status)}
   pf.reset();st.className='pp-status ok';st.textContent='Thank you! We received your application and will email you within '+pf.dataset.review+'.';
  }catch(err){
   st.className='pp-status err';st.textContent=(err&&err.message&&!/^HTTP /.test(err.message))?err.message:'Something went wrong. Please try again, or email us instead.';
  }finally{btn.disabled=false}
 });
})();

(function(){
 const el=document.getElementById('ref-note');
 if(!el)return;
 try{
  const v=JSON.parse(localStorage.getItem('vs_ref')||'null');
  const days=Number(el.dataset.days)||30;
  if(v&&/^[A-Z0-9]{8}$/.test(v.code)&&Date.now()-v.ts<days*864e5){el.querySelector('[data-code]').textContent=v.code;el.hidden=false}
 }catch(e){}
})();
