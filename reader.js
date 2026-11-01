// GitHub Pages Reader — intentionally has NO authentication or access to private learner data.
// Only explicit, reviewed, public-safe static topic JSON may be placed at ./topics.json.
const byId=id=>document.getElementById(id);
const list=byId('listing'),article=byId('article'),items=byId('topic-list'),status=byId('status');
const prefix='learnova-static-v1:';
let topics=[];
const DB_NAME='learnova-static-reader-private-v1';
function readStore(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>request.result.createObjectStore('library');
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>resolve(request.result);
 });
}
async function cacheTopics(value){
 const db=await readStore();
 try{await new Promise((resolve,reject)=>{
  const tx=db.transaction('library','readwrite');tx.objectStore('library').put(value,'topics');
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
 });}finally{db.close();}
}
async function cachedTopics(){
 const db=await readStore();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction('library','readonly');const request=tx.objectStore('library').get('topics');
  request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);
 });}finally{db.close();}
}
async function clearStored(){
 const db=await readStore();
 try{await new Promise((resolve,reject)=>{
   const tx=db.transaction('library','readwrite');tx.objectStore('library').clear();
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
 });}finally{db.close();}
 for(const key of Object.keys(localStorage)) if(key.startsWith(prefix))localStorage.removeItem(key);
}
function nativeTopic(data){
 if(data?.schema!=='JSONTOPIC-1.0'||typeof data.topic_id!=='string'||!data.title)return null;
 const sections=[];
 const add=(heading,body)=>{if(typeof body==='string'&&body.trim())sections.push({heading,body});};
 add('In brief',data.summaries?.single_line);
 add('Summary',data.summaries?.short);
 add('Detailed summary',data.summaries?.full);
 for(const n of data.nodes||[]){
   const lines=Array.isArray(n.content)?n.content.map(x=>typeof x==='string'?x:x?.text).filter(x=>typeof x==='string'&&x.trim()):[];
   add(n.title||'Content',lines.join('\n\n')||(n.summary||''));
 }
 return {id:data.topic_id,title:data.title,category:data.tags?.join(' · ')||data.source?.pdf_id||'',keywords:data.keywords||[],sections};
}
function asExport(data){
 if(data?.schema==='JSONTOPIC-1.0')return {format:'learnova-static-reader-v1',topics:[nativeTopic(data)]};
 if(Array.isArray(data))return {format:'learnova-static-reader-v1',topics:data.map(x=>x?.schema==='JSONTOPIC-1.0'?nativeTopic(x):x)};
 return data;
}
function parseTopics(data){
 data=asExport(data);
 if(data?.format!=='learnova-static-reader-v1' || !Array.isArray(data.topics) || !data.topics.length)throw Error('Expected nonempty Learnova Reader export');
 if(data.topics.length>3000)throw Error('Export exceeds topic limit');
 const rows=data.topics.map(cleanTopic);
 if(rows.some(x=>!x||!x.sections.length)||new Set(rows.map(x=>x.id)).size!==rows.length)throw Error('Invalid or duplicate topic records');
 return rows;
}

function cleanTopic(t){
 if(!t || typeof t!=='object')return null;
 const id=String(t.id||'').trim(),title=String(t.title||'').trim();
 if(!id||!title||!Array.isArray(t.sections))return null;
 const sections=t.sections.filter(x=>x&&typeof x.heading==='string'&&typeof x.body==='string')
   .map(x=>({heading:x.heading,body:x.body}));
 return {id,title,category:String(t.category||''),keywords:Array.isArray(t.keywords)?t.keywords.map(String):[],sections};
}
function showTopic(id){
 const t=topics.find(x=>x.id===id);if(!t)return;
 list.hidden=true;article.hidden=false;byId('title').textContent=t.title;
 byId('metadata').textContent=t.category;
 const body=byId('text');body.replaceChildren();
 for(const section of t.sections){
  const h=document.createElement('h2');h.textContent=section.heading;body.append(h);
  const p=document.createElement('p');p.textContent=section.body;body.append(p);
 }
 const mark=byId('mark'),bookmark=byId('bookmark');
 const sync=()=>{
   mark.textContent=localStorage.getItem(prefix+'read:'+id)==='1'?'✓ Read':'Mark read';
   bookmark.textContent=localStorage.getItem(prefix+'save:'+id)==='1'?'✓ Saved':'Save';
 };
 mark.onclick=()=>{const key=prefix+'read:'+id;localStorage.setItem(key,localStorage.getItem(key)==='1'?'0':'1');sync();};
 bookmark.onclick=()=>{const key=prefix+'save:'+id;localStorage.setItem(key,localStorage.getItem(key)==='1'?'0':'1');sync();};
 sync();window.scrollTo(0,0);
 location.hash=encodeURIComponent(id);
}
function showList(){
 list.hidden=false;article.hidden=true;history.replaceState(null,'',location.pathname+location.search);
 render();window.scrollTo(0,0);
}
function render(){
 const term=byId('search').value.toLocaleLowerCase().trim();items.replaceChildren();
 const visible=topics.filter(t=>(t.title+' '+t.category+' '+t.keywords.join(' ')).toLocaleLowerCase().includes(term));
 status.textContent=visible.length+' approved topics available';
 for(const t of visible){
  const card=document.createElement('div');card.className='card';
  const title=document.createElement('h2');title.textContent=t.title;
  const meta=document.createElement('p');meta.className='muted';meta.textContent=t.category;
  const open=document.createElement('button');open.className='primary';open.textContent='Read topic';open.onclick=()=>showTopic(t.id);
  const saved=document.createElement('small');
  saved.className='muted';saved.textContent=localStorage.getItem(prefix+'read:'+t.id)==='1'?'Previously read':'';
  card.append(title,meta,open,saved);items.append(card);
 }
}
byId('back').onclick=showList;byId('search').oninput=render;
async function loadTopics(){
 // No public topic endpoint exists. Contents can ONLY be imported privately in the browser.
 try {
  const data=await cachedTopics();
  if(data)topics=parseTopics(data);
 } catch(err) {
  console.warn('Browser storage unavailable; manual file import remains possible',err);
 }
 if(topics.length){
  render();
  const hash=decodeURIComponent(location.hash.slice(1));
  if(hash)showTopic(hash);
 } else {
  status.textContent='Reader is ready. To display GK topics, first choose your private topics.json file above.';
 }
}
byId('import-file').addEventListener('change',async(e)=>{
 const files=Array.from(e.target.files||[]);if(!files.length)return;
 try{
  const merged=new Map(topics.map(t=>[t.id,t]));
  for(const file of files){
    if(file.size>25*1024*1024)throw Error(file.name+': file exceeds 25 MB');
    const valid=parseTopics(JSON.parse(await file.text()));
    for(const t of valid)merged.set(t.id,t);
    if(merged.size>3000)throw Error('More than 3000 topics; split into smaller libraries');
  }
  const result={format:'learnova-static-reader-v1',topics:[...merged.values()]};
  try { await cacheTopics(result); } catch(err) { console.warn('Browser could not persist topics',err); }
  topics=result.topics;showList();
  status.textContent=topics.length+' topics imported privately into this browser.';
 }catch(err){status.textContent='Import failed: '+err.message;}
 finally{e.target.value='';}
});
byId('clear-data').addEventListener('click',async()=>{
 if(!confirm('Delete all saved topics, reading marks and bookmarks from this browser? Keep your original export backup.'))return;
 try { await clearStored(); } catch(err) { console.warn(err); }
 topics=[];showList();status.textContent='Browser data cleared where available. Original files were not changed.';
});
loadTopics().catch(err=>{status.textContent='Reader storage unavailable: '+err.message;});
