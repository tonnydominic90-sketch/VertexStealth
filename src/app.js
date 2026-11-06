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
 try{if(localStorage.getItem('vs.session')){document.querySelectorAll('[data-auth-link]').forEach(function(l){l.textContent='Account';l.setAttribute('href','/account');});}}catch(e){}
 var dl=document.querySelector('[data-dl]');
 if(dl){dl.addEventListener('click',function(){var n=document.getElementById('dlStarted');if(n)n.hidden=false;var s=dl.querySelector('span');dl.firstChild.textContent='Starting download… ';if(s)s.textContent='✓';});}
 var p=location.pathname;
 if(navigator.doNotTrack==='1'||/^\/(admin|api)/.test(p))return;
 try{var d=JSON.stringify({path:p.slice(0,200),ref:document.referrer?new URL(document.referrer).hostname:'',w:window.innerWidth});
  if(navigator.sendBeacon){navigator.sendBeacon('/api/track',new Blob([d],{type:'application/json'}));}else{fetch('/api/track',{method:'POST',body:d,keepalive:true,headers:{'Content-Type':'application/json'}});}}catch(e){}
})();

(function(){
 var dl=document.querySelector('[data-dl]'); if(!dl)return;
 fetch('/api/download',{headers:{Accept:'application/json'}}).then(function(r){return r.ok?r.json():null}).then(function(d){
  if(!d||!d.url||d.url.indexOf('https://github.com/')!==0)return;
  dl.setAttribute('href',d.url);
  var v=document.querySelector('[data-dl-version]'); if(v&&d.version){v.textContent='Version '+d.version;v.hidden=false;}
 }).catch(function(){});
})();

(function(){
 var n=document.getElementById('refNote'); if(!n)return;
 try{var v=JSON.parse(localStorage.getItem('vs_ref')||'null');
  if(v&&/^[A-Z0-9]{8}$/.test(String(v.code||''))&&Date.now()-(v.ts||0)<14*864e5){var c=n.querySelector('[data-ref-code]');if(c)c.textContent=v.code;n.hidden=false;}
 }catch(e){}
})();
