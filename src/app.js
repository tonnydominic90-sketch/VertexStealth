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
