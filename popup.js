'use strict';
const c={style:document.getElementById('style-enabled'),frontend:document.getElementById('frontend-enabled'),fenbi:document.getElementById('fenbi-enabled'),comments:document.getElementById('comments-enabled'),video:document.getElementById('hide-video-enabled'),monochrome:document.getElementById('monochrome-enabled'),aiLecture:document.getElementById('ai-lecture-optimization-enabled'),csdn:document.getElementById('csdn-enabled'),csdnBeautify:document.getElementById('csdn-beautify-enabled'),csdnMonochrome:document.getElementById('csdn-monochrome-enabled'),csdnPosition:document.getElementById('csdn-position'),zhihu:document.getElementById('zhihu-enabled'),zhihuComments:document.getElementById('zhihu-comments-enabled'),zhihuMonochrome:document.getElementById('zhihu-monochrome-enabled'),common:document.getElementById('common-enabled'),commonMonochrome:document.getElementById('common-monochrome-enabled'),pwdFill:document.getElementById('pwd-fill-enabled'),json:document.getElementById('json-enabled'),adfilter:document.getElementById('adfilter-enabled')};
const storageKey={style:'styleEnabled',frontend:'frontendEnabled',fenbi:'fenbiEnabled',comments:'forceCommentsEnabled',video:'hideVideo',monochrome:'monochrome',aiLecture:'aiLectureOptimizationEnabled',csdn:'csdnEnabled',csdnBeautify:'csdnBeautify',csdnMonochrome:'csdnMonochrome',zhihu:'zhihuEnabled',zhihuComments:'zhihuComments',zhihuMonochrome:'zhihuMonochrome',common:'commonEnabled',commonMonochrome:'commonMonochrome',pwdFill:'pwdFillEnabled',json:'jsonEnabled',adfilter:'adFilterEnabled'};
const second=[...document.querySelectorAll('.feature--second')],third=[...document.querySelectorAll('.feature--third')],tops=[...document.querySelectorAll('.feature--top')];
const defaults={styleEnabled:true,frontendEnabled:true,fenbiEnabled:true,forceCommentsEnabled:false,hideVideo:false,monochrome:false,aiLectureOptimizationEnabled:false,csdnEnabled:true,csdnBeautify:true,csdnMonochrome:false,csdnPosition:'center',zhihuEnabled:true,zhihuComments:true,zhihuMonochrome:false,commonEnabled:true,commonMonochrome:false,pwdFillEnabled:false,jsonEnabled:false,adFilterEnabled:true,collapsedGroups:{style:true,frontend:true,fenbi:true,csdn:true,zhihu:true,common:true}};
function isCollapsed(s,key){return (s.collapsedGroups||{})[key]!==false}
function setToggle(section,collapsed){const b=section.querySelector('[data-collapse]');if(!b)return;b.textContent=collapsed?'＋':'−';b.setAttribute('aria-expanded',String(!collapsed));}
function setHidden(items,hidden){for(const item of items)item.hidden=hidden}
function render(s){
  for(const key of Object.keys(storageKey)) c[key].checked=Boolean(s[storageKey[key]]);
  c.csdnPosition.value=['left','center','right'].includes(s.csdnPosition)?s.csdnPosition:'center';
  const styleOn=s.styleEnabled!==false, frontendOn=s.frontendEnabled!==false;
  const styleCollapsed=isCollapsed(s,'style'), frontendCollapsed=isCollapsed(s,'frontend');
  for(const top of tops){const key=top.dataset.group;setToggle(top,key==='style'?styleCollapsed:frontendCollapsed)}
  for(const section of second){
    const key=section.dataset.group,parent=section.dataset.parent;
    const parentCollapsed=parent==='style'?styleCollapsed:frontendCollapsed;
    const ownCollapsed=section.querySelector('[data-collapse]')?isCollapsed(s,key):false;
    setToggle(section,ownCollapsed);
    section.hidden=parentCollapsed;
    const input=section.querySelector('input,select');
    if(input)input.disabled=!(parent==='style'?styleOn:frontendOn);
  }
  for(const section of third){
    const parent=section.dataset.parent,parentSection=second.find(x=>x.dataset.group===parent);
    const parentOn=parent==='fenbi'?styleOn&&s.fenbiEnabled:parent==='csdn'?styleOn&&s.csdnEnabled:parent==='zhihu'?styleOn&&s.zhihuEnabled:styleOn&&s.commonEnabled;
    section.hidden=Boolean(parentSection?.hidden||isCollapsed(s,parent));
    const input=section.querySelector('input,select');if(input)input.disabled=!parentOn;
  }
}
function save(k,v){
  chrome.storage.sync.set({[k]:v},()=>{
    // 清除早期错误状态键，避免旧值在后续弹窗加载时干扰规范状态。
    if(k==='monochrome') chrome.storage.sync.remove('monochromeEnabled');
    if(k==='hideVideo') chrome.storage.sync.remove('videoEnabled');
  });
}
function updateCollapse(key,collapsed){chrome.storage.sync.get({collapsedGroups:{}},r=>chrome.storage.sync.set({collapsedGroups:{...(r.collapsedGroups||{}),[key]:collapsed}}))}
function descendants(key){return [...document.querySelectorAll(`[data-parent="${key}"]`)]}
function loadSettings(){
  chrome.storage.sync.get(null,raw=>{
    // 兼容早期弹窗错误写入的键：以新的规范键为准，只有缺失时才迁移。
    const migration={};
    if(raw.monochrome===undefined && typeof raw.monochromeEnabled==='boolean') migration.monochrome=raw.monochromeEnabled;
    if(raw.hideVideo===undefined && typeof raw.videoEnabled==='boolean') migration.hideVideo=raw.videoEnabled;
    const finish=()=>chrome.storage.sync.get(defaults,render);
    Object.keys(migration).length?chrome.storage.sync.set(migration,finish):finish();
  });
}
loadSettings();
for(const key of Object.keys(storageKey)) c[key].addEventListener('change',()=>{
  save(storageKey[key],c[key].checked);
  if(key==='json' && c[key].checked) chrome.tabs.create({url:chrome.runtime.getURL('json.html')});
});
c.csdnPosition.addEventListener('change',()=>save('csdnPosition',c.csdnPosition.value));
for(const top of tops){const b=top.querySelector('[data-collapse]');b.addEventListener('click',()=>{const key=top.dataset.group,hide=b.getAttribute('aria-expanded')==='true';setToggle(top,hide);setHidden(second.filter(x=>x.dataset.parent===key),hide);updateCollapse(key,hide)})}
for(const section of second){const b=section.querySelector('[data-collapse]');if(!b)continue;b.addEventListener('click',()=>{const key=section.dataset.group,hide=b.getAttribute('aria-expanded')==='true';setToggle(section,hide);setHidden(third.filter(x=>x.dataset.parent===key),hide);updateCollapse(key,hide)})}
chrome.storage.onChanged.addListener((_,area)=>{if(area==='sync')chrome.storage.sync.get(defaults,render)})
