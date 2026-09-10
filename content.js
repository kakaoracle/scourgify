'use strict';

const PANEL_ATTR = 'data-fcp-comments';
const PAGE_SIZE = 30;
const MAX_PAGES = 2;
const questionIdMapCache = new Map();
let settings = { fenbiEnabled:true, forceCommentsEnabled:false, hideVideo:false, monochrome:false, aiLectureOptimizationEnabled:false, csdnEnabled:true, csdnBeautify:true, csdnMonochrome:false, csdnPosition:'center', zhihuEnabled:true, zhihuComments:true, zhihuMonochrome:false, commonEnabled:true, commonMonochrome:false, adFilterEnabled:true };

function isCsdnPage() {
  return location.hostname === 'blog.csdn.net';
}

function isFenbiPage() {
  return location.hostname === 'spa.fenbi.com' || location.hostname === 'www.fenbi.com';
}

function isAiLecturePage() {
  return location.hostname === 'www.fenbi.com' && /^\/spa\/pwa\/ai-lecture\//.test(location.pathname);
}

function applyAiLectureOptimization() {
  const active = Boolean(isAiLecturePage() && settings.fenbiEnabled && settings.aiLectureOptimizationEnabled);
  document.documentElement.classList.toggle('kakaoracle-ai-lecture-optimization', active);
  document.documentElement.dataset.kakaoracleAiLectureOptimization = active ? 'on' : 'off';
}

function aiLectureParams() {
  const match=location.pathname.match(/^\/spa\/pwa\/ai-lecture\/([^/]+)\/(\d+)/);
  return match ? {course:match[1],userLectureId:match[2]} : null;
}

function isAiLectureOptimizationActive() {
  return Boolean(isAiLecturePage() && settings.fenbiEnabled && settings.aiLectureOptimizationEnabled);
}

function closeAiLectureModal() {
  document.querySelector('[data-fcp-ai-lecture-modal]')?.remove();
}

function createAiLectureModal(title,pageLike=false) {
  closeAiLectureModal();
  const overlay=document.createElement('div');
  overlay.className='fcp-ai-modal';
  if(pageLike) overlay.classList.add('fcp-ai-modal--page');
  overlay.setAttribute('data-fcp-ai-lecture-modal','');
  const dialog=document.createElement('section');
  dialog.className='fcp-ai-modal__dialog';
  dialog.setAttribute('role','dialog');
  dialog.setAttribute('aria-modal','true');
  const header=document.createElement('header');
  header.className='fcp-ai-modal__header';
  const heading=document.createElement('h2');
  heading.textContent=title;
  const close=document.createElement('button');
  close.type='button';
  close.className='fcp-ai-modal__close';
  close.setAttribute('aria-label','关闭');
  close.textContent='×';
  close.addEventListener('click',closeAiLectureModal);
  const body=document.createElement('div');
  body.className='fcp-ai-modal__body';
  header.append(heading,close);
  dialog.append(header,body);
  overlay.appendChild(dialog);
  overlay.addEventListener('click',event=>{if(event.target===overlay)closeAiLectureModal()});
  document.body.appendChild(overlay);
  return body;
}

function createTextElement(tag,className,text) {
  const element=document.createElement(tag);
  if(className) element.className=className;
  element.textContent=text;
  return element;
}

function formatPlanDate(value) {
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) return String(value||'');
  return date.toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'});
}

function phaseStatus(phase) {
  if(phase?.current) return {text:'当前阶段',className:'is-current'};
  if(phase?.started) return {text:'已开始',className:'is-started'};
  return {text:'未开始',className:'is-pending'};
}

function safePlanImage(value) {
  try {
    const url=new URL(value);
    return url.protocol==='https:' && (url.hostname.endsWith('.fbstatic.cn')||url.hostname.endsWith('.fenbi.com')) ? url.href : '';
  } catch { return ''; }
}

function renderPlanMetric(item) {
  const card=document.createElement('div');
  card.className='fcp-ai-plan-page__metric';
  const imageUrl=safePlanImage(item?.icon);
  if(imageUrl){const image=document.createElement('img');image.src=imageUrl;image.alt='';card.appendChild(image)}
  const copy=document.createElement('div');
  copy.append(
    createTextElement('span','fcp-ai-plan-page__metric-label',item?.title||'学习目标'),
    createTextElement('strong','fcp-ai-plan-page__metric-value',`${item?.quantity??'—'}${item?.unit||''}`),
    createTextElement('small','fcp-ai-plan-page__metric-desc',item?.desc||'')
  );
  card.appendChild(copy);
  return card;
}

function renderPlanDetail(title,text,count) {
  if(!text && !count) return null;
  const card=document.createElement('article');
  card.className='fcp-ai-plan-page__detail';
  const heading=document.createElement('div');
  heading.className='fcp-ai-plan-page__detail-heading';
  heading.appendChild(createTextElement('h4','',title));
  if(count) heading.appendChild(createTextElement('span','',String(count)));
  card.append(heading,createTextElement('p','',text||'暂无说明'));
  return card;
}

function unwrapAiPayload(payload) {
  if(payload?.code!==undefined && payload.code!==0 && payload.code!==1) throw new Error(payload.msg||`接口返回 code ${payload.code}`);
  return payload?.data??payload;
}

function findDeepValue(value,keys,depth=0) {
  if(depth>7 || !value || typeof value!=='object') return undefined;
  for(const key of keys) if(value[key]!==undefined && value[key]!==null) return value[key];
  for(const child of Object.values(value)) {
    const found=findDeepValue(child,keys,depth+1);
    if(found!==undefined) return found;
  }
  return undefined;
}

function findDeepArrays(value,depth=0,result=[]) {
  if(depth>7 || !value || typeof value!=='object') return result;
  if(Array.isArray(value)) {
    if(value.length) result.push(value);
    for(const child of value) findDeepArrays(child,depth+1,result);
  } else for(const child of Object.values(value)) findDeepArrays(child,depth+1,result);
  return result;
}

function finiteNumber(value) {
  if(typeof value==='boolean' || value==='' || value===null || value===undefined) return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

function collectAiPlanDiagnostics(value,path='root',depth=0,result=[]) {
  if(depth>7 || result.length>=120 || value===null || value===undefined) return result;
  if(Array.isArray(value)) {
    const first=value.find(item=>item && typeof item==='object');
    if(first) {
      const sample={};
      for(const [key,item] of Object.entries(first)) {
        if(item===null || ['string','number','boolean'].includes(typeof item)) sample[key]=item;
        else sample[key]=Array.isArray(item)?`array(${item.length})`:'object';
      }
      result.push({path,length:value.length,sample});
    }
    value.slice(0,2).forEach((item,index)=>collectAiPlanDiagnostics(item,`${path}[${index}]`,depth+1,result));
  } else if(typeof value==='object') {
    for(const [key,item] of Object.entries(value)) collectAiPlanDiagnostics(item,`${path}.${key}`,depth+1,result);
  }
  return result;
}

function percentNumber(value) {
  const number=finiteNumber(value);
  if(number===null) return null;
  return Math.max(0,Math.min(100,number<=1?number*100:number));
}

function readRecordValue(record,keys) {
  for(const key of keys) if(record?.[key]!==undefined && record[key]!==null) return record[key];
  return undefined;
}

function normalizeAbilitySeries(...sources) {
  const preferredKeys=['keypoints','subjectCorrectRates','abilityTargets','abilityStats','capacities','subjectScores','courseCorrectRates','tikuCourseCorrectRates'];
  const arrays=[];
  for(const source of sources) {
    const preferred=findDeepValue(source,preferredKeys);
    if(Array.isArray(preferred)) arrays.push(preferred);
    arrays.push(...findDeepArrays(source));
  }
  let best=[];
  for(const array of arrays) {
    const normalized=array.map(item=>{
      if(!item || typeof item!=='object') return null;
      const label=readRecordValue(item,['title','subjectName','moduleName','name','typeName','label']);
      const current=percentNumber(readRecordValue(item,['currentCorrectRate','currentRate','currentScore','correctRate','score','value','current']));
      const target=percentNumber(readRecordValue(item,['targetCorrectRate','targetRate','targetScore','targetValue','goal','target']));
      return label && (current!==null || target!==null) ? {
        label:String(label),current:current??0,target:target??current??0,
        currentProgress:finiteNumber(item.currentProgress),targetProgress:finiteNumber(item.targetProgress),
        currentStudyMinutes:finiteNumber(item.currentStudyMinutes),targetStudyMinutes:finiteNumber(item.targetStudyMinutes),
        answerQuestionCount:finiteNumber(item.answerQuestionCount),targetAnswerQuestionCount:finiteNumber(item.targetAnswerQuestionCount),
        dataExplain:typeof item.dataExplain==='string'?item.dataExplain:'',
      } : null;
    }).filter(Boolean);
    if(normalized.length>=3 && normalized.length>best.length) best=normalized;
  }
  return best.slice(0,8);
}

function svgElement(tag,attributes={}) {
  const element=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const [key,value] of Object.entries(attributes)) element.setAttribute(key,String(value));
  return element;
}

function renderRadarChart(series) {
  const wrap=document.createElement('div');
  wrap.className='fcp-ai-dashboard__radar';
  if(series.length<3){wrap.appendChild(createTextElement('div','fcp-ai-dashboard__empty','能力数据暂未生成'));return wrap}
  const size=320,center=160,radius=105,count=series.length;
  const svg=svgElement('svg',{viewBox:`0 0 ${size} ${size}`,role:'img','aria-label':'能力目标雷达图'});
  const point=(index,value=100)=>{
    const angle=-Math.PI/2+index*Math.PI*2/count;
    const r=radius*Math.max(0,Math.min(100,value))/100;
    return [center+r*Math.cos(angle),center+r*Math.sin(angle)];
  };
  for(let ring=1;ring<=5;ring++) svg.appendChild(svgElement('polygon',{points:series.map((_,index)=>point(index,ring*20).join(',')).join(' '),class:'fcp-ai-radar__grid'}));
  const detail=document.createElement('div');detail.className='fcp-ai-dashboard__radar-detail';
  const showDetail=item=>{
    detail.replaceChildren();
    detail.appendChild(createTextElement('strong','',item.label));
    const values=[
      ['当前正确率',`${Math.round(item.current)}%`],['目标正确率',`${Math.round(item.target)}%`],
      ['达标考点',item.currentProgress!==null?`${item.currentProgress}${item.targetProgress!==null?` / ${item.targetProgress}`:''}`:'—'],
      ['学习时长',item.currentStudyMinutes!==null?formatStudyDuration(item.currentStudyMinutes):'—'],
      ['完成题目',item.answerQuestionCount!==null?`${item.answerQuestionCount}${item.targetAnswerQuestionCount!==null?` / ${item.targetAnswerQuestionCount}`:''}`:'—'],
    ];
    const grid=document.createElement('div');
    for(const [label,value] of values){const row=document.createElement('span');row.append(createTextElement('small','',label),createTextElement('b','',value));grid.appendChild(row)}
    detail.appendChild(grid);
    if(item.dataExplain) detail.appendChild(createTextElement('p','',item.dataExplain));
  };
  series.forEach((item,index)=>{
    const [x,y]=point(index);
    svg.appendChild(svgElement('line',{x1:center,y1:center,x2:x,y2:y,class:'fcp-ai-radar__axis'}));
    const [lx,ly]=point(index,126);
    const text=svgElement('text',{x:lx,y:ly,class:'fcp-ai-radar__label','text-anchor':lx<center-10?'end':lx>center+10?'start':'middle'});
    const title=svgElement('tspan',{x:lx,dy:'-0.25em'});title.textContent=item.label;
    const value=svgElement('tspan',{x:lx,dy:'1.35em',class:'fcp-ai-radar__label-value'});value.textContent=`${Math.round(item.current)}% / ${Math.round(item.target)}%`;
    text.append(title,value);
    svg.appendChild(text);
  });
  svg.append(
    svgElement('polygon',{points:series.map((item,index)=>point(index,item.target).join(',')).join(' '),class:'fcp-ai-radar__target'}),
    svgElement('polygon',{points:series.map((item,index)=>point(index,item.current).join(',')).join(' '),class:'fcp-ai-radar__current'})
  );
  series.forEach((item,index)=>{
    const [x,y]=point(index,item.current);
    const dot=svgElement('circle',{cx:x,cy:y,r:5,class:'fcp-ai-radar__dot',tabindex:0,role:'button','aria-label':`${item.label}，当前${Math.round(item.current)}%，目标${Math.round(item.target)}%`});
    dot.addEventListener('mouseenter',()=>showDetail(item));
    dot.addEventListener('focus',()=>showDetail(item));
    dot.addEventListener('click',()=>showDetail(item));
    svg.appendChild(dot);
  });
  wrap.append(svg,detail);
  showDetail(series[0]);
  const legend=document.createElement('div');legend.className='fcp-ai-dashboard__legend';
  legend.append(createTextElement('span','is-current','当前能力'),createTextElement('span','is-target','能力目标'));
  wrap.appendChild(legend);
  return wrap;
}

function formatStudyDuration(value) {
  const number=finiteNumber(value);
  if(number===null) return '—';
  const minutes=number>10000?Math.round(number/60000):Math.round(number);
  return minutes>=60?`${Math.floor(minutes/60)}小时${minutes%60?`${minutes%60}分`:''}`:`${minutes}分钟`;
}

function firstFiniteDeep(source,keys) {
  return finiteNumber(findDeepValue(source,keys));
}

function dashboardSection(title,subtitle='') {
  const section=document.createElement('section');section.className='fcp-ai-dashboard__section';
  const header=document.createElement('header');
  header.appendChild(createTextElement('h3','',title));
  if(subtitle) header.appendChild(createTextElement('p','',subtitle));
  section.appendChild(header);
  return section;
}

function renderProgressRing(progress) {
  const safe=Math.max(0,Math.min(100,progress??0));
  const ring=document.createElement('div');ring.className='fcp-ai-dashboard__progress-ring';
  ring.style.setProperty('--fcp-progress',`${safe*3.6}deg`);
  ring.append(createTextElement('strong','',`${Math.round(safe)}%`),createTextElement('span','','已完成'));
  return ring;
}

function normalizePlanTasks(...sources) {
  const arrays=[];
  for(const source of sources) {
    const preferred=findDeepValue(source,['modulePlans','userTaskGroups','taskGroups','dailyPlans','tasks','plans']);
    if(Array.isArray(preferred)) arrays.push(preferred);
    arrays.push(...findDeepArrays(source));
  }
  let best=[];
  for(const array of arrays) {
    const items=array.map(item=>{
      if(!item || typeof item!=='object') return null;
      const title=readRecordValue(item,['title','taskName','name','subjectName','moduleName','typeName']);
      if(!title) return null;
      const desc=readRecordValue(item,['desc','description','recommendDesc','subtitle','content']);
      const current=finiteNumber(readRecordValue(item,['finishTaskCount','completedCount','finishCount','current','doneCount']));
      const total=finiteNumber(readRecordValue(item,['taskCount','totalCount','count','target','quantity']));
      return {title:String(title),desc:typeof desc==='string'?desc:'',current,total};
    }).filter(Boolean);
    if(items.length>best.length) best=items;
  }
  return best.slice(0,12);
}

function renderScoreBars(series) {
  const chart=document.createElement('div');chart.className='fcp-ai-dashboard__bars';
  const data=series.length?series.slice(0,7):[];
  if(!data.length){chart.appendChild(createTextElement('div','fcp-ai-dashboard__empty','本周成绩数据暂未生成'));return chart}
  for(const item of data) {
    const row=document.createElement('div');row.className='fcp-ai-dashboard__bar-row';
    const label=createTextElement('span','',item.label);
    const track=document.createElement('div');track.className='fcp-ai-dashboard__bar-track';
    const fill=document.createElement('i');fill.style.width=`${Math.round(item.current)}%`;track.appendChild(fill);
    row.append(label,track,createTextElement('strong','',`${Math.round(item.current)}%`));chart.appendChild(row);
  }
  return chart;
}

function normalizeForecastScores(source) {
  const scores=findDeepValue(source,['forecastScores']);
  if(!Array.isArray(scores)) return [];
  return scores.map(item=>({
    label:String(item?.forecastScoreTitle||item?.title||'预测成绩'),
    current:Math.max(0,finiteNumber(item?.currentForecastScore)??0),
    target:Math.max(0,finiteNumber(item?.targetForecastScore)??0),
    total:Math.max(1,finiteNumber(item?.totalScore)??100),
    diff:finiteNumber(item?.diffForecastScore),
  }));
}

function renderForecastScores(scores) {
  const chart=document.createElement('div');chart.className='fcp-ai-dashboard__score-cards';
  if(!scores.length){chart.appendChild(createTextElement('div','fcp-ai-dashboard__empty','本周成绩数据暂未生成'));return chart}
  for(const item of scores) {
    const card=document.createElement('article');
    const head=document.createElement('div');head.append(createTextElement('span','',item.label),createTextElement('strong','',`${item.current} / ${item.target}`));
    const track=document.createElement('div');track.className='fcp-ai-dashboard__score-track';
    const current=document.createElement('i');current.className='is-current';current.style.width=`${Math.min(100,item.current/item.total*100)}%`;
    const target=document.createElement('i');target.className='is-target';target.style.left=`${Math.min(100,item.target/item.total*100)}%`;
    track.append(current,target);card.append(head,track);
    card.appendChild(createTextElement('p','',item.diff!==null?`较阶段初提升 ${item.diff} 分`:`满分 ${item.total} 分`));chart.appendChild(card);
  }
  return chart;
}

function aiLectureApiUrl(params,path,extra={}) {
  const url=new URL(`https://keapi.fenbi.com/ai/api/user_ai_lecture/${path}`);
  const mobileParams={user_lecture_id:params.userLectureId,platform:'ios',vendor:'app',ua:'ios',device_app:'gwy',app:'webstudent',av:'100',kav:'100',hav:'122',gav:'2',apcid:'0'};
  for(const [key,value] of Object.entries({...mobileParams,...extra})) url.searchParams.set(key,value);
  return url.href;
}

function weekBounds(week) {
  const start=new Date(finiteNumber(week?.startDayTime)??Date.now());start.setHours(0,0,0,0);
  const end=new Date(finiteNumber(week?.endDayTime)??start.getTime());end.setHours(23,59,59,999);
  return {start,end};
}

async function loadAiLectureWeekData(params,week) {
  const {start,end}=weekBounds(week);
  const requestSeed=Date.now();
  const dayRequests=[];
  for(let day=new Date(start),index=0;day<=end && index<7;day.setDate(day.getDate()+1),index++) {
    const timestamp=day.getTime();
    dayRequests.push(requestJson(aiLectureApiUrl(params,'timetable/daily_report',{day:String(timestamp),seed:String(requestSeed+index)})));
  }
  const settled=await Promise.allSettled(dayRequests);
  const days=await Promise.all(settled.map(async (result,index)=>{
    if(result.status!=='fulfilled') return null;
    let report;
    try { report=unwrapAiPayload(result.value); } catch { return null; }
    const day=new Date(start);day.setDate(start.getDate()+index);
    let groups=Array.isArray(report?.userTaskGroups)?report.userTaskGroups:[];
    const dailyPlanId=report?.dailyPlan?.dailyPlanIdStr??report?.dailyPlan?.dailyPlanId;
    if(dailyPlanId) {
      try {
        const groupPayload=await requestJson(aiLectureApiUrl(params,'timetable/user_task_groups',{daily_plan_id:String(dailyPlanId),start:'0',len:'1000',seed:String(requestSeed+100+index)}));
        groups=Array.isArray(groupPayload?.datas)?groupPayload.datas:Array.isArray(groupPayload?.data)?groupPayload.data:groups;
      } catch {}
    }
    return {day:day.getTime(),report,groups};
  }));
  const availableDays=days.filter(Boolean);
  return {week,days:availableDays,reports:availableDays.map(item=>item.report)};
}

function groupTasks(group) {
  if(group?.useSingleTask && group?.task) return [group.task];
  const steps=group?.steps;
  if(Array.isArray(steps?.steps)) return steps.steps.flatMap(step=>Array.isArray(step?.tasks)?step.tasks:[]);
  if(Array.isArray(steps?.tasks)) return steps.tasks;
  return group?.task?[group.task]:[];
}

function weeklyTaskCounts(days) {
  const tasks=days.flatMap(day=>day.groups||[]).flatMap(groupTasks);
  if(!tasks.length) return {finished:null,total:null};
  return {
    finished:tasks.filter(task=>task?.finished===true||finiteNumber(task?.status)===10).length,
    total:tasks.length,
  };
}

function aggregateTaskTimes(reports) {
  const map=new Map();
  for(const report of reports) for(const item of (report?.taskTimeStats?.taskTimeStats||[])) {
    const name=String(item?.name||'其他');
    const current=map.get(name)||{name,color:item?.color,studyTime:0};
    current.studyTime+=finiteNumber(item?.studyTime)??0;map.set(name,current);
  }
  return [...map.values()].filter(item=>item.studyTime>0).sort((a,b)=>b.studyTime-a.studyTime);
}

function safeChartColor(value,index) {
  return /^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):['#7165f6','#68a9ff','#f5a45d','#54c6a4','#e57a9d','#8b91a7'][index%6];
}

function renderTimeDonut(items) {
  const wrap=document.createElement('div');wrap.className='fcp-ai-week__distribution';
  if(!items.length){wrap.appendChild(createTextElement('div','fcp-ai-dashboard__empty','本周暂无任务时长'));return wrap}
  const total=items.reduce((sum,item)=>sum+item.studyTime,0);let cursor=0;const stops=[];
  items.forEach((item,index)=>{const start=cursor;cursor+=item.studyTime/total*360;stops.push(`${safeChartColor(item.color,index)} ${start}deg ${cursor}deg`)});
  const donut=document.createElement('div');donut.className='fcp-ai-week__donut';donut.style.background=`conic-gradient(${stops.join(',')})`;
  const center=document.createElement('div');center.append(createTextElement('strong','',formatStudyDuration(total)),createTextElement('span','','总用时'));donut.appendChild(center);
  const legend=document.createElement('div');legend.className='fcp-ai-week__time-legend';
  items.forEach((item,index)=>{const row=document.createElement('div');const label=document.createElement('span');label.style.setProperty('--fcp-chart-color',safeChartColor(item.color,index));label.textContent=item.name;row.append(label,createTextElement('strong','',formatStudyDuration(item.studyTime)));legend.appendChild(row)});
  wrap.append(donut,legend);return wrap;
}

function rankZoneInfo(rank) {
  const zone=finiteNumber(rank?.rankZone);
  if(zone===1) return {text:'晋级区',className:'is-upgrade'};
  if(zone===2) return {text:'保级区',className:'is-maintain'};
  if(zone===3) return {text:'降级区',className:'is-downgrade'};
  return {text:'暂无分区',className:'is-unknown'};
}

function directStatSum(reports,key) {
  let total=0,found=false;
  for(const report of reports){const value=finiteNumber(report?.dailyStudyStat?.[key]);if(value!==null){total+=value;found=true}}
  return found?total:null;
}

function renderWeeklyOverview(container,weekData) {
  const reports=weekData.reports||[];container.replaceChildren();
  const detailCounts=weeklyTaskCounts(weekData.days||[]);
  const finished=directStatSum(reports,'finishTaskCount')??detailCounts.finished;
  const totalTasks=directStatSum(reports,'taskCount')??directStatSum(reports,'targetTaskCount')??detailCounts.total;
  const studyTime=directStatSum(reports,'studyTime');
  const targetStudyTime=directStatSum(reports,'targetStudyTime');
  const questions=directStatSum(reports,'answerQuestionCount');
  const progress=finished!==null&&totalTasks?finished/totalTasks*100:studyTime!==null&&targetStudyTime?studyTime/targetStudyTime*100:0;
  const rank=[...reports].reverse().map(report=>report?.dailyStudyStat?.rank).find(Boolean)||{};
  const zone=rankZoneInfo(rank);
  const summary=document.createElement('div');summary.className='fcp-ai-week__summary';
  const ring=renderProgressRing(progress);
  const zoneCard=document.createElement('div');zoneCard.className=`fcp-ai-week__zone ${zone.className}`;
  zoneCard.append(createTextElement('span','','当前学习分区'),createTextElement('strong','',zone.text),createTextElement('small','',rank?.rank?`本周排名 ${rank.rank}`:'依据本周学习完成情况动态评定'));
  const metrics=document.createElement('div');metrics.className='fcp-ai-week__metrics';
  const values=[
    ['学习时长',`${formatStudyDuration(studyTime)}${targetStudyTime!==null?` / ${formatStudyDuration(targetStudyTime)}`:''}`],
    ['完成任务数',finished!==null?`${finished}${totalTasks!==null?` / ${totalTasks}`:''}`:'—'],
    ['做题数量',questions!==null?String(questions):'—'],
    ['任务完成度',`${Math.round(Math.max(0,Math.min(100,progress)))}%`],
  ];
  for(const [label,value] of values){const item=document.createElement('div');item.append(createTextElement('span','',label),createTextElement('strong','',value));metrics.appendChild(item)}
  summary.append(ring,zoneCard,metrics);
  const distribution=document.createElement('div');distribution.className='fcp-ai-week__distribution-card';
  distribution.append(createTextElement('h4','','任务时长分布'),renderTimeDonut(aggregateTaskTimes(reports)));
  container.append(summary,distribution);
}

function taskDisplayTitle(task) {
  if(Array.isArray(task?.titles) && task.titles.length) return task.titles.map(value=>typeof value==='string'?value:value?.title||value?.name||'').filter(Boolean).join(' · ');
  return String(task?.title||task?.subTitle||task?.tag||task?.taskName||'学习任务');
}

function renderTaskGroups(container,weekData) {
  container.replaceChildren();
  const days=(weekData.days||[]).filter(item=>item.groups?.length);
  if(!days.length){container.appendChild(createTextElement('div','fcp-ai-dashboard__empty','该周暂无可展示的计划详情'));return}
  for(const dayData of days) {
    const daySection=document.createElement('section');daySection.className='fcp-ai-week-plan__day';
    daySection.appendChild(createTextElement('h4','',new Date(dayData.day).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit',weekday:'short'})));
    for(const group of dayData.groups) {
      const article=document.createElement('article');article.className='fcp-ai-week-plan__group';
      const header=document.createElement('button');header.type='button';header.className='fcp-ai-week-plan__group-header';
      const titleBox=document.createElement('span');titleBox.append(createTextElement('strong','',group?.title||'学习模块'),createTextElement('small','',group?.finished?'已完成':'进行中'));
      header.append(titleBox,createTextElement('b','',`${formatStudyDuration(group?.studyTime)} / ${formatStudyDuration(group?.targetStudyTime)}`));
      const body=document.createElement('div');body.className='fcp-ai-week-plan__group-body';
      const tasks=groupTasks(group);
      if(group?.extraTitle) body.appendChild(createTextElement('p','fcp-ai-week-plan__explain',group.extraTitle));
      for(const task of tasks) {
        const row=document.createElement('div');row.className='fcp-ai-week-plan__task';
        const copy=document.createElement('div');copy.append(createTextElement('strong','',taskDisplayTitle(task)),createTextElement('span','',task?.subTitle||task?.tag||''));
        row.append(copy,createTextElement('b',task?.status===10?'is-finished':'',task?.statusShowName||'待学习'));body.appendChild(row);
      }
      if(!tasks.length) body.appendChild(createTextElement('div','fcp-ai-dashboard__empty','该模块暂无任务明细'));
      body.hidden=true;header.addEventListener('click',()=>{body.hidden=!body.hidden;header.classList.toggle('is-open',!body.hidden)});
      article.append(header,body);daySection.appendChild(article);
    }
    container.appendChild(daySection);
  }
}

function renderAiLectureDashboard(body,summary,phaseData,timetable,initialWeekData,params) {
  const reports=initialWeekData.reports||[];
  body.classList.add('fcp-ai-modal__body--plan');
  const current=(summary?.phases||[]).find(phase=>phase?.current)||summary?.phases?.find(phase=>phase?.started)||{};
  const abilitySeries=normalizeAbilitySeries(phaseData,...reports,timetable);
  const page=document.createElement('div');page.className='fcp-ai-dashboard';
  const diagnostics=document.createElement('pre');
  diagnostics.hidden=true;
  diagnostics.setAttribute('data-fcp-ai-plan-diagnostics','');
  diagnostics.textContent=JSON.stringify({
    phase:collectAiPlanDiagnostics(phaseData,'phase'),
    timetable:collectAiPlanDiagnostics(timetable,'timetable'),
    dailyReports:reports.map((report,index)=>collectAiPlanDiagnostics(report,`dailyReports[${index}]`)),
  });
  page.appendChild(diagnostics);
  const intro=document.createElement('div');intro.className='fcp-ai-dashboard__intro';
  intro.append(
    createTextElement('div','fcp-ai-dashboard__breadcrumb','首页 / 学习规划'),
    createTextElement('h2','',summary?.lectureName||'AI 刷题班学习规划'),
    createTextElement('p','',current?.title?`当前阶段：${current.title}`:'根据你的学情动态生成学习目标与每周计划')
  );
  page.appendChild(intro);

  const topGrid=document.createElement('div');topGrid.className='fcp-ai-dashboard__grid';
  const ability=dashboardSection('能力目标','当前能力与目标能力对比');
  ability.appendChild(renderRadarChart(abilitySeries));
  topGrid.append(ability);page.appendChild(topGrid);

  const progress=dashboardSection('学习计划本周学习进度','可切换查看每周学习统计，默认定位当周');
  const weekNav=document.createElement('nav');weekNav.className='fcp-ai-week__nav';weekNav.setAttribute('aria-label','学习周次');
  const weekContent=document.createElement('div');weekContent.className='fcp-ai-week__content';
  const weeks=Array.isArray(phaseData?.weekPlans?.weeks)?phaseData.weekPlans.weeks:[];
  const details=dashboardSection('本周计划详情','按日期、学习模块与具体任务展示');
  const detailContent=document.createElement('div');detailContent.className='fcp-ai-week-plan';details.appendChild(detailContent);
  let activeWeek=initialWeekData.week;
  const setActiveButton=week=>{for(const button of weekNav.querySelectorAll('button')) button.classList.toggle('is-active',button.dataset.week===String(week?.week))};
  const selectWeek=async week=>{
    activeWeek=week;setActiveButton(week);weekContent.replaceChildren(createTextElement('div','fcp-ai-modal__status','正在加载该周学习统计…'));
    detailContent.replaceChildren(createTextElement('div','fcp-ai-modal__status','正在加载该周计划详情…'));
    try {const data=await loadAiLectureWeekData(params,week);if(activeWeek!==week)return;renderWeeklyOverview(weekContent,data);renderTaskGroups(detailContent,data)}
    catch(error){weekContent.replaceChildren(createTextElement('div','fcp-ai-modal__status',`周数据加载失败：${error.message}`));detailContent.replaceChildren()}
  };
  for(const week of weeks) {
    const button=document.createElement('button');button.type='button';button.dataset.week=String(week?.week||'');button.textContent=week?.title||'学习周';
    if(week?.current) button.appendChild(createTextElement('small','','本周'));
    button.addEventListener('click',()=>selectWeek(week));weekNav.appendChild(button);
  }
  progress.append(weekNav,weekContent);page.appendChild(progress);
  renderWeeklyOverview(weekContent,initialWeekData);renderTaskGroups(detailContent,initialWeekData);setActiveButton(activeWeek);

  const score=dashboardSection('本周成绩','各科目正确率 / 得分');
  score.appendChild(renderForecastScores(normalizeForecastScores(phaseData)));page.appendChild(score);

  page.appendChild(details);

  const path=dashboardSection('阶段学习路径','完整阶段安排');
  const pathBody=document.createElement('div');pathBody.className='fcp-ai-dashboard__path';
  renderAiLecturePlan(pathBody,summary);
  path.appendChild(pathBody);page.appendChild(path);
  body.appendChild(page);
}

function renderAiLecturePlan(body,data) {
  const phases=Array.isArray(data?.phases)?data.phases:[];
  body.classList.add('fcp-ai-modal__body--plan');
  const hero=document.createElement('section');
  hero.className='fcp-ai-plan-page__hero';
  const heroCopy=document.createElement('div');
  heroCopy.append(
    createTextElement('span','fcp-ai-plan-page__eyebrow','AI 刷题班学习路径'),
    createTextElement('h3','',data?.lectureName||'学习规划'),
    createTextElement('p','',`共 ${phases.length} 个学习阶段，按计划稳步推进。`)
  );
  const current=phases.find(phase=>phase?.current);
  if(current) heroCopy.appendChild(createTextElement('strong','fcp-ai-plan-page__current',`当前：${current.title||'学习阶段'}`));
  hero.appendChild(heroCopy);
  body.appendChild(hero);

  if(!phases.length){
    const empty=createTextElement('div','fcp-ai-modal__status','当前课程暂无学习规划数据。');
    body.appendChild(empty);
    return;
  }

  const nav=document.createElement('nav');
  nav.className='fcp-ai-plan-page__nav';
  nav.setAttribute('aria-label','学习阶段');
  const content=document.createElement('div');
  content.className='fcp-ai-plan-page__content';

  phases.forEach((phase,index)=>{
    const status=phaseStatus(phase);
    const section=document.createElement('section');
    section.className=`fcp-ai-plan-page__phase ${status.className}`;
    section.id=`fcp-ai-plan-phase-${index+1}`;

    const navButton=document.createElement('button');
    navButton.type='button';
    navButton.className=status.className;
    navButton.append(
      createTextElement('span','',`阶段 ${index+1}`),
      createTextElement('strong','',phase?.title||`第 ${index+1} 阶段`),
      createTextElement('small','',status.text)
    );
    navButton.addEventListener('click',()=>section.scrollIntoView({behavior:'smooth',block:'start'}));
    nav.appendChild(navButton);

    const header=document.createElement('header');
    const titleBox=document.createElement('div');
    titleBox.append(
      createTextElement('span',`fcp-ai-plan-page__badge ${status.className}`,status.text),
      createTextElement('h3','',phase?.title||`第 ${index+1} 阶段`),
      createTextElement('p','fcp-ai-plan-page__dates',`${formatPlanDate(phase?.startDay)} — ${formatPlanDate(phase?.endDay)}`)
    );
    header.appendChild(titleBox);
    if(phase?.desc) header.appendChild(createTextElement('p','fcp-ai-plan-page__phase-desc',phase.desc));
    section.appendChild(header);

    const target=phase?.target||{};
    if(target.studyTarget) section.appendChild(createTextElement('div','fcp-ai-plan-page__target',target.studyTarget));
    const metrics=document.createElement('div');
    metrics.className='fcp-ai-plan-page__metrics';
    for(const item of (Array.isArray(phase?.studyContents)?phase.studyContents:[])) metrics.appendChild(renderPlanMetric(item));
    if(metrics.childNodes.length) section.appendChild(metrics);

    const details=document.createElement('div');
    details.className='fcp-ai-plan-page__details';
    const detailItems=[
      renderPlanDetail('学习内容',target.studyContent,target.studyContentKeypointCount?`${target.studyContentKeypointCount} 个考点`:''),
      renderPlanDetail('课程安排',target.studyEpisode,target.studyEpisodeCount?`${target.studyEpisodeCount} 节课`:''),
      renderPlanDetail('题目练习',target.studyQuestion,target.studyQuestionCount?`${target.studyQuestionCount} 题`:''),
      renderPlanDetail('日常积累',target.studyAddition,target.studyAdditionCount||''),
    ].filter(Boolean);
    details.append(...detailItems);
    if(details.childNodes.length) section.appendChild(details);
    content.appendChild(section);
  });

  body.append(nav,content);
}

async function openAiLecturePlan() {
  const params=aiLectureParams();
  const body=createAiLectureModal('学习规划',true);
  const status=document.createElement('div');
  status.className='fcp-ai-modal__status';
  status.textContent='正在加载学习规划…';
  body.appendChild(status);
  if(!params){status.textContent='无法识别当前 AI 刷题班课程。';return}
  const now=new Date();
  const weekStart=new Date(now);weekStart.setDate(now.getDate()-((now.getDay()+6)%7));weekStart.setHours(0,0,0,0);
  const weekEnd=new Date(weekStart);weekEnd.setDate(weekStart.getDate()+6);weekEnd.setHours(23,59,59,999);
  try {
    const results=await Promise.allSettled([
      requestJson(aiLectureApiUrl(params,'study_plan/summary')),
      requestJson(aiLectureApiUrl(params,'study_phase')),
    ]);
    if(results[0].status!=='fulfilled') throw results[0].reason;
    const optionalData=result=>{
      if(result.status!=='fulfilled') return null;
      try { return unwrapAiPayload(result.value); } catch { return null; }
    };
    const summary=unwrapAiPayload(results[0].value);
    const phaseData=optionalData(results[1]);
    const weeks=Array.isArray(phaseData?.weekPlans?.weeks)?phaseData.weekPlans.weeks:[];
    const selectedWeek=weeks.find(week=>week?.current)||weeks.find(week=>weekStart.getTime()<=Number(week?.endDayTime)&&weekEnd.getTime()>=Number(week?.startDayTime))||{title:'本周',week:weekEnd.getFullYear()*10000+(weekEnd.getMonth()+1)*100+weekEnd.getDate(),startDayTime:weekStart.getTime(),endDayTime:weekEnd.getTime(),current:true};
    const {start,end}=weekBounds(selectedWeek);
    const [timetableResult,initialWeekData]=await Promise.all([
      requestJson(aiLectureApiUrl(params,'timetable',{start_time:String(start.getTime()),end_time:String(end.getTime())})).then(unwrapAiPayload).catch(()=>null),
      loadAiLectureWeekData(params,selectedWeek),
    ]);
    body.replaceChildren();
    renderAiLectureDashboard(body,summary,phaseData,timetableResult,initialWeekData,params);
  } catch(error) {
    status.textContent=`学习规划加载失败：${error.message}`;
    const retry=document.createElement('button');
    retry.type='button';retry.className='fcp-ai-modal__retry';retry.textContent='重试';
    retry.addEventListener('click',openAiLecturePlan);
    body.appendChild(retry);
  }
}

function currentWeekEndTimestamp() {
  const date=new Date();
  date.setDate(date.getDate()+((7-date.getDay())%7));
  date.setHours(23,59,59,999);
  return date.getTime();
}

function openAiLectureRank() {
  const params=aiLectureParams();
  const body=createAiLectureModal('排行榜单',true);
  if(!params){body.textContent='无法识别当前 AI 刷题班课程。';return}
  const url=new URL('https://www.fenbi.com/fpr/fb-system-class-v2/classTimeRank');
  for(const [key,value] of Object.entries({hasTitleBar:'false',isFloatBar:'true',userLectureId:params.userLectureId,dayTime:String(currentWeekEndTimestamp()),inPC:'1'})) url.searchParams.set(key,value);
  const iframe=document.createElement('iframe');
  iframe.className='fcp-ai-modal__frame';
  iframe.title='排行榜单';
  iframe.src=url.href;
  body.classList.add('fcp-ai-modal__body--frame');
  body.appendChild(iframe);
}

function handleAiLectureMenuClick(event) {
  if(!isAiLectureOptimizationActive() || !(event.target instanceof Element)) return;
  const menu=event.target.closest('.menu-item-outer');
  if(!menu || !menu.closest('app-ai-lecture-home')) return;
  const title=(menu.querySelector('.menu-item-title')?.textContent||menu.textContent||'').trim();
  if(title!=='学习规划' && title!=='排行榜单' && title!=='学习榜单') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if(title==='学习规划') openAiLecturePlan(); else openAiLectureRank();
}

document.addEventListener('click',handleAiLectureMenuClick,true);

function isFenbiSolutionPage() {
  return location.hostname === 'spa.fenbi.com' && /^\/ti\/exam\/solution\//.test(location.pathname);
}

function isCommentEnhancementPage() {
  // 粉笔绝大多数页面已有原生评论，扩展绝不干预。
  // 仅在解析、记忆这两类原生未展示评论的页面由“强开评论”补充面板。
  return isFenbiSolutionPage() || (location.hostname === 'spa.fenbi.com' && /^\/ti\/memorize\//.test(location.pathname));
}

function isZhihuPage() {
  return location.hostname === 'www.zhihu.com';
}

function isGenericTarget() {
  return /^https?:$/.test(location.protocol) && !isFenbiPage() && !isCsdnPage() && !isZhihuPage();
}

function requestJsonFromBackground(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'FCP_FETCH_JSON', url }, (response) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!response?.ok) return reject(new Error(response?.error || '网络请求失败'));
      resolve(response.data);
    });
  });
}

async function requestJsonDirect(url) {
  const response = await fetch(url,{method:'GET',credentials:'include',headers:{Accept:'application/json, text/plain, */*'}});
  if (!response.ok) throw new Error(`页面 HTTP ${response.status}（${new URL(url).hostname}${new URL(url).pathname}）`);
  try { return await response.json(); } catch { throw new Error('页面请求返回的不是有效 JSON'); }
}

async function requestJson(url) {
  const errors=[];
  try { return await requestJsonDirect(url); } catch (error) { errors.push(error.message); }
  try { return await requestJsonFromBackground(url); } catch (error) { errors.push(error.message); }
  throw new Error([...new Set(errors)].join('；'));
}

function currentExerciseParams() {
  const match = location.pathname.match(/^\/ti\/(?:exam\/solution|memorize)\/([^/]+)/);
  if (!match) return null;
  const query = new URLSearchParams(location.search);
  return {
    key:decodeURIComponent(match[1]),
    routecs:query.get('routecs')||'xingce',
    examcatid:query.get('examcatid')||'',
  };
}

function pageQuestionKeys() {
  return [...document.querySelectorAll('app-ti[data-question-key]')]
    .map(item=>item.getAttribute('data-question-key')).filter(Boolean);
}

function validateQuestionMap(result) {
  const keys=pageQuestionKeys();
  if (!keys.length) throw new Error('页面尚未渲染题目');
  const missing=keys.filter(key=>!result.has(key));
  if (missing.length) throw new Error(`只映射到 ${keys.length-missing.length}/${keys.length} 道题`);
  return result;
}

function collectLegacyQuestionIds(exercise,report) {
  const byIndex=new Map();
  for (const answer of Object.values(exercise?.userAnswers??{})) {
    const index=Number(answer?.questionIndex);
    const id=Number(answer?.questionId);
    if (Number.isInteger(index) && Number.isSafeInteger(id) && id>0) byIndex.set(index,id);
  }
  for (const [fallbackIndex,answer] of (report?.answers??[]).entries()) {
    const index=Number.isInteger(Number(answer?.questionIndex)) ? Number(answer.questionIndex) : fallbackIndex;
    const id=Number(answer?.questionId);
    if (!byIndex.has(index) && Number.isSafeInteger(id) && id>0) byIndex.set(index,id);
  }
  return [...byIndex.entries()].sort((a,b)=>a[0]-b[0]).map(([,id])=>id);
}

async function mapFromLegacyReport(solution,params) {
  const ancientId=Number(solution?.ancientExerciseId?.id??solution?.ancientExerciseId);
  if (!Number.isSafeInteger(ancientId) || ancientId<=0) throw new Error('getSolution 未返回 ancientExerciseId');
  const base=`https://tiku.fenbi.com/api/${encodeURIComponent(params.routecs)}/exercises/${ancientId}`;
  const [exercisePayload,reportPayload]=await Promise.all([requestJson(base),requestJson(`${base}/report/v2`)]);
  const exercise=exercisePayload?.data??exercisePayload;
  const report=reportPayload?.data??reportPayload;
  const ids=collectLegacyQuestionIds(exercise,report);
  const keys=pageQuestionKeys();
  if (ids.length<keys.length) throw new Error(`旧版报告只有 ${ids.length}/${keys.length} 个题目 ID`);
  const result=new Map(keys.map((key,index)=>[key,ids[index]]));
  return validateQuestionMap(result);
}

function normalizeStaticUrls(staticUrl, routecs) {
  const urls = Array.isArray(staticUrl?.urls) ? staticUrl.urls : [];
  if (!urls.length) throw new Error('练习数据未返回题目静态数据地址');
  return urls.map((value) => {
    const url = new URL(value, 'https://tiku.fenbi.com');
    // 粉笔页面自身也会为 type=1 的静态题目请求补上这两个参数。
    // 记忆页对应的展示类型固定为 1（Memorize）。
    if (Number(staticUrl?.type) === 1) {
      url.searchParams.set('routecs', routecs);
      url.searchParams.set('type', '1');
    }
    return url.href;
  });
}

function questionIdFromStaticQuestion(question) {
  const candidates = [
    question?.id,
    question?.questionId,
    question?.question?.id,
    question?.question?.questionId,
    question?.originQuestion?.id,
  ];
  for (const value of candidates) {
    const id = Number(value);
    if (Number.isSafeInteger(id) && id > 0) return id;
  }
  return null;
}

function mapFromMemorizeStatic(payloads) {
  const questions = payloads.flatMap((payload) => {
    const data = payload?.data ?? payload;
    return data?.solutions ?? data?.questions ?? [];
  });
  if (!questions.length) throw new Error('题目静态数据中没有题目列表');

  const result = new Map();
  for (const question of questions) {
    const key = question?.globalId ?? question?.questionKey ?? question?.key;
    const id = questionIdFromStaticQuestion(question);
    if (key && id) result.set(String(key), id);
  }

  // 静态数据没有键时，粉笔的题目顺序与页面渲染顺序一致；仅在数量完全一致时才使用此兜底，
  // 避免把评论贴到错误题目上。
  const keys = pageQuestionKeys();
  if (result.size === 0 && questions.length === keys.length) {
    questions.forEach((question, index) => {
      const id = questionIdFromStaticQuestion(question);
      if (id) result.set(keys[index], id);
    });
  }
  return validateQuestionMap(result);
}

async function mapFromMemorizeExercise(params) {
  const url = new URL('https://tiku.fenbi.com/combine/exercise/getExercise');
  for (const [key,value] of Object.entries({format:'html',key:params.key,routecs:params.routecs,kav:'125',av:'127',hav:'125',app:'web',apcid:'0',gav:'2'})) url.searchParams.set(key,value);
  const deviceId = localStorage.getItem('deviceSid');
  if (deviceId) url.searchParams.set('deviceId',deviceId);
  const exercisePayload = await requestJson(url.href);
  const exercise = exercisePayload?.data ?? exercisePayload;
  const staticUrls = normalizeStaticUrls(exercise?.staticUrl, params.routecs);
  const staticPayloads = await Promise.all(staticUrls.map(requestJson));
  return mapFromMemorizeStatic(staticPayloads);
}

async function loadQuestionIdMap() {
  const params = currentExerciseParams();
  if (!params) throw new Error('当前页面不是练习解析页');
  const cacheKey = `${params.routecs}:${params.key}:${params.examcatid}`;
  if (questionIdMapCache.has(cacheKey)) return questionIdMapCache.get(cacheKey);
  const loading = (async()=>{
    if (/^\/ti\/memorize\//.test(location.pathname)) {
      return {map:await mapFromMemorizeExercise(params),strategy:'fenbi-memorize-static'};
    }
    const url = new URL('https://tiku.fenbi.com/combine/exercise/getSolution');
    for (const [key,value] of Object.entries({format:'html',key:params.key,routecs:params.routecs,kav:'125',av:'127',hav:'125',app:'web',apcid:'0',gav:'2'})) url.searchParams.set(key,value);
    if (params.examcatid) url.searchParams.set('examcatid',params.examcatid);
    const deviceId = localStorage.getItem('deviceSid');
    if (deviceId) url.searchParams.set('deviceId',deviceId);
    const solutionPayload = await requestJson(url.href);
    const solution = solutionPayload?.data ?? solutionPayload;
    return {map:await mapFromLegacyReport(solution,params),strategy:'scourgify-legacy-report'};
  })();
  questionIdMapCache.set(cacheKey,loading);
  try { return await loading; } catch (error) { questionIdMapCache.delete(cacheKey); throw error; }
}

async function resolveQuestionId(questionKey) {
  const resolved=await loadQuestionIdMap();
  return {id:resolved.map.get(questionKey)??null,strategy:resolved.strategy};
}

function findEpisodeId(value,seen=new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) { const id=findEpisodeId(item,seen); if (id) return id; }
    return null;
  }
  if ((typeof value.id === 'number' || typeof value.id === 'string') && value.id) return value.id;
  for (const child of Object.values(value)) { const id=findEpisodeId(child,seen); if (id) return id; }
  return null;
}

async function getEpisodeId(questionId) {
  const url = new URL('https://ke.fenbi.com/api/gwy/v3/episodes/tiku_episodes_with_multi_type');
  for (const [key,value] of Object.entries({tiku_ids:String(questionId),tiku_prefix:'xingce',tiku_type:'5'})) url.searchParams.set(key,value);
  const payload = await requestJson(url.href);
  return findEpisodeId(payload?.data?.[questionId] ?? payload?.data?.[String(questionId)]);
}

async function getComments(episodeId) {
  const requests = Array.from({length:MAX_PAGES},(_,index)=>{
    const url = new URL(`https://ke.fenbi.com/ipad/gwy/v3/comments/episodes/${episodeId}`);
    for (const [key,value] of Object.entries({system:'12.4.7',inhouse:'0',app:'gwy',ua:'iPad',av:'44',version:'6.11.3',len:String(PAGE_SIZE),start:String(index*PAGE_SIZE)})) url.searchParams.set(key,value);
    url.searchParams.append('kav','22'); url.searchParams.append('kav','1');
    return requestJson(url.href);
  });
  const settled = await Promise.allSettled(requests);
  const payloads = settled.filter(item=>item.status==='fulfilled').map(item=>item.value);
  if (!payloads.length) throw settled[0]?.reason ?? new Error('评论请求失败');
  const byId = new Map();
  for (const payload of payloads) {
    const comments = payload?.datas ?? payload?.data?.datas ?? payload?.data ?? [];
    if (!Array.isArray(comments)) continue;
    for (const comment of comments) byId.set(comment.id ?? `${comment.createdTime??''}:${comment.comment??''}`,comment);
  }
  return [...byId.values()].sort((a,b)=>(b.likeCount??0)-(a.likeCount??0));
}

function formatTime(value) {
  if (!value) return '';
  const normalized = typeof value==='number' && value<1e12 ? value*1000 : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN',{hour12:false});
}

function renderComments(panel,comments) {
  const status=panel.querySelector('.fcp-comments__status'), list=panel.querySelector('.fcp-comments__list'), count=panel.querySelector('.fcp-comments__count');
  list.replaceChildren(); count.textContent=comments.length?`（${comments.length} 条）`:'';
  if (!comments.length) { status.hidden=false; status.textContent='暂时没有获取到题友评论。'; return; }
  status.hidden=true;
  for (const item of comments) {
    const row=document.createElement('li'); row.className='fcp-comment';
    const text=document.createElement('p'); text.className='fcp-comment__text'; text.textContent=item.comment||item.content||'（空评论）'; row.appendChild(text);
    const values=[
      {value:item.user?.nickname||item.userInfo?.nickname||item.nickname||''},
      {value:item.likeCount!==undefined?`赞 ${item.likeCount}`:''},
      {value:item.fiveGradeScore?`评分 ${item.fiveGradeScore}`:'',className:'fcp-comment__rating'},
      {value:formatTime(item.createdTime)},
    ].filter(item=>item.value);
    if (values.length) { const meta=document.createElement('div'); meta.className='fcp-comment__meta'; for (const item of values) { const span=document.createElement('span'); span.textContent=item.value; if(item.className) span.className=item.className; meta.appendChild(span); } row.appendChild(meta); }
    list.appendChild(row);
  }
}

async function loadPanel(panel,questionKey) {
  if (panel.dataset.loading==='true') return;
  panel.dataset.loading='true';
  const status=panel.querySelector('.fcp-comments__status'), retry=panel.querySelector('.fcp-comments__action');
  retry.hidden=true; status.hidden=false; status.textContent='正在加载题友评论…';
  try {
    const resolved=await resolveQuestionId(questionKey);
    panel.dataset.fcpStrategy=resolved.strategy;
    if (!resolved.id) throw new Error('练习数据中找不到当前题目的数字 ID');
    const episodeId=await getEpisodeId(resolved.id);
    if (!episodeId) throw new Error('该题暂未关联评论数据');
    renderComments(panel,await getComments(episodeId));
  } catch (error) {
    status.hidden=false;
    status.textContent=`评论加载失败：${error.message}`;
    retry.hidden=false;
    const body=panel.querySelector('.fcp-comments__body');
    const toggle=panel.querySelector('.fcp-comments__toggle');
    body.hidden=false;
    toggle.textContent='收起';
  }
  finally { panel.dataset.loading='false'; }
}

function createPanel(questionKey) {
  const panel=document.createElement('section'); panel.className='fcp-comments'; panel.setAttribute(PANEL_ATTR,questionKey); panel.dataset.fcpSource='chrome-extension';
  const heading=document.createElement('div'); heading.className='fcp-comments__heading';
  const title=document.createElement('span'); title.className='fcp-comments__title'; title.append('题友评论'); const count=document.createElement('span'); count.className='fcp-comments__count'; title.appendChild(count);
  const actions=document.createElement('div'); actions.className='fcp-comments__actions';
  const toggle=document.createElement('button'); toggle.type='button'; toggle.className='fcp-comments__action fcp-comments__toggle'; toggle.textContent='收起';
  const retry=document.createElement('button'); retry.type='button'; retry.className='fcp-comments__action'; retry.textContent='重试'; retry.hidden=true; retry.addEventListener('click',()=>loadPanel(panel,questionKey));
  actions.append(retry,toggle); heading.append(title,actions);
  const body=document.createElement('div'); body.className='fcp-comments__body'; body.hidden=false;
  const status=document.createElement('div'); status.className='fcp-comments__status'; status.textContent='正在加载题友评论…'; const list=document.createElement('ol'); list.className='fcp-comments__list'; body.append(status,list); panel.append(heading,body);
  toggle.addEventListener('click',()=>{ body.hidden=!body.hidden; toggle.textContent=body.hidden?'展开':'收起'; });
  return panel;
}

function enhanceQuestions() {
  if (!isCommentEnhancementPage() || !settings.fenbiEnabled || !settings.forceCommentsEnabled) return;
  for (const question of document.querySelectorAll('app-ti[data-question-key]')) {
    const questionKey=question.getAttribute('data-question-key');
    if (!questionKey || question.querySelector(`[${PANEL_ATTR}]`)) continue;
    const panel=createPanel(questionKey); const anchor=question.querySelector('[id^="section-note-"]')||question.querySelector('[id^="section-source-"]')||question.lastElementChild;
    if (anchor) anchor.insertAdjacentElement('afterend',panel); else question.appendChild(panel); loadPanel(panel,questionKey);
  }
}

function applyVideoVisibility() {
  if (!isFenbiPage()) return;
  document.querySelectorAll('[id^="section-video-"], .solution-video-container, .video-container').forEach(element=>element.classList.toggle('fcp-hide-video',settings.fenbiEnabled && settings.hideVideo));
}

function applyMonochrome() {
  const active = Boolean(isFenbiPage() && settings.fenbiEnabled && settings.monochrome);
  const root = document.documentElement;

  // 第一层：粉笔全站共享黑白基线。
  root.classList.toggle('kakaoracle-monochrome', active);

  // 第二层：粉笔不同 SPA 路由的局部补丁。新增路由时只在这里登记，
  // 不改变共享开关，也不影响其他网站。
  root.classList.toggle(
    'kakaoracle-fenbi-guide-monochrome',
    active && location.pathname.startsWith('/spa/tiku/guide/')
  );
  root.dataset.kakaoracleMonochrome = active ? 'on' : 'off';
}

function applyCsdnBeautify() {
  document.documentElement.classList.toggle('kakaoracle-csdn-beautify', Boolean(isCsdnPage() && settings.csdnEnabled && settings.csdnBeautify));
  document.documentElement.classList.toggle('kakaoracle-csdn-monochrome', Boolean(isCsdnPage() && settings.csdnEnabled && settings.csdnMonochrome));
  if (isCsdnPage()) document.documentElement.dataset.csdnPosition=['left','center','right'].includes(settings.csdnPosition)?settings.csdnPosition:'center';
}

function applyZhihuSettings() {
  const active=isZhihuPage() && settings.zhihuEnabled;
  document.documentElement.classList.toggle('kakaoracle-zhihu-comments-only', Boolean(active && settings.zhihuComments));
  document.documentElement.classList.toggle('kakaoracle-zhihu-monochrome', Boolean(active && settings.zhihuMonochrome));
}

function applyCommonMonochrome() {
  document.documentElement.classList.toggle('kakaoracle-common-monochrome', Boolean(isGenericTarget() && settings.commonEnabled && settings.commonMonochrome));
}

// ---------------- 广告过滤 ----------------
// 三层结构：内置基础规则（最保守的通用签名）→ 订阅源（background.js 拉取，存 storage.local）
// → 个性化路由表（ad-routes.js，按站点精修）。仅在通用站点生效，粉笔/CSDN/知乎不受影响。
const AD_FILTER_STYLE_ID = 'kakaoracle-adfilter-style';
const AD_DATA_KEY = 'adFilterData';
const AD_BASE_SELECTORS = [
  'ins.adsbygoogle',
  'iframe[src*="googlesyndication.com"]', 'iframe[src*="doubleclick.net"]',
  'iframe[src*="googleadservices.com"]', 'iframe[src*="adnxs.com"]',
  'iframe[src*="popads.net"]', 'iframe[src*="propellerads"]',
  'iframe[src*="clickadu"]', 'iframe[src*="exoclick"]', 'iframe[src*="juicyads"]',
  'div[id^="div-gpt-ad"]', 'div[id^="google_ads"]', 'div[class*="adsbygoogle"]',
  'a[href*="doubleclick.net"]',
];
const AD_BASE_HOSTS = [
  'googlesyndication.com', 'doubleclick.net', 'googleadservices.com', 'googletagservices.com',
  'adnxs.com', 'adsrvr.org', 'pubmatic.com', 'criteo.com', 'criteo.net', 'amazon-adsystem.com',
  'taboola.com', 'outbrain.com', 'popads.net', 'popcash.net', 'propellerads.com',
  'clickadu.com', 'exoclick.com', 'juicyads.com', 'adcash.com', 'hilltopads.net',
];
let adFilterData = { selectors: [], hostSelectors: [], exceptions: [], hosts: [] };
let adFilterSiteOverrides = {};
let adFilterVersion = 0;
let adFilterCssCache = { key: '', css: '' };

function hostMatchesSuffix(hostname, suffix) {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

function resolveAdFilterRoute() {
  const host = location.hostname;
  const mergeEntry = (base, extra) => ({
    ...base, ...extra,
    selectors: [...(base?.selectors || []), ...(extra?.selectors || [])],
    blockHosts: [...(base?.blockHosts || []), ...(extra?.blockHosts || [])],
    whitelist: [...(base?.whitelist || []), ...(extra?.whitelist || [])],
  });
  const fileRoute = (self.KAKAORACLE_AD_ROUTES || []).find(entry =>
    Array.isArray(entry?.match) && entry.match.some(suffix => typeof suffix === 'string' && hostMatchesSuffix(host, suffix))) || null;
  const overrideKey = Object.keys(adFilterSiteOverrides).find(key => hostMatchesSuffix(host, key));
  const override = overrideKey ? adFilterSiteOverrides[overrideKey] : null;
  if (!fileRoute && !override) return null;
  return mergeEntry(fileRoute, override);
}

function buildAdFilterCss(route) {
  // CSS 构建要遍历全部订阅选择器，用版本号 + 路由快照做缓存，
  // 避免每次 DOM 变化都重算。
  const cacheKey = `${adFilterVersion}|${route ? JSON.stringify(route) : ''}`;
  if (adFilterCssCache.key === cacheKey) return adFilterCssCache.css;
  const whitelist = new Set(route?.whitelist || []);
  const exceptionSet = new Set(adFilterData.exceptions || []);
  const selectors = [];
  const seen = new Set();
  const push = selector => {
    if (!selector || seen.has(selector) || whitelist.has(selector) || exceptionSet.has(selector)) return;
    seen.add(selector);
    selectors.push(selector);
  };
  if (!route || route.subscription !== false) {
    AD_BASE_SELECTORS.forEach(push);
    (adFilterData.selectors || []).forEach(push);
    for (const item of (adFilterData.hostSelectors || [])) {
      if (hostMatchesSuffix(location.hostname, item.h)) push(item.s);
    }
  }
  (route?.selectors || []).forEach(push);
  const css = selectors.length
    ? selectors.reduce((chunks, selector, index) => {
        const slot = Math.floor(index / 50);
        chunks[slot] = chunks[slot] ? `${chunks[slot]},${selector}` : selector;
        return chunks;
      }, []).map(chunk => `${chunk}{display:none!important}`).join('\n')
    : '';
  adFilterCssCache = { key: cacheKey, css };
  return css;
}

function adBlockedHostSet(route, active) {
  const hostSet = new Set(AD_BASE_HOSTS);
  if (!active) return hostSet;
  if (!route || route.subscription !== false) {
    for (const host of (adFilterData.hosts || [])) hostSet.add(host);
  }
  for (const host of (route?.blockHosts || [])) hostSet.add(host);
  return hostSet;
}

function applyAdFilterFrames(route, active) {
  const hostSet = adBlockedHostSet(route, active);
  for (const frame of document.querySelectorAll('iframe,embed,object')) {
    if (frame.dataset.kakaoracleAdframe) continue;
    let url;
    try { url = new URL(frame.getAttribute('src') || frame.getAttribute('data') || '', location.href); } catch { url = null; }
    if (!url || !hostMatchesSuffixChain(url.hostname, hostSet)) continue;
    frame.dataset.kakaoracleAdframe = 'blocked';
    frame.remove();
  }
}

function hostMatchesSuffixChain(hostname, hostSet) {
  const parts = hostname.split('.');
  for (let index = 0; index < parts.length; index++) {
    if (hostSet.has(parts.slice(index).join('.'))) return true;
  }
  return false;
}

function applyAdFilter() {
  let active = Boolean(isGenericTarget() && settings.adFilterEnabled);
  const route = active ? resolveAdFilterRoute() : null;
  if (route?.enabled === false) active = false;
  const css = active ? buildAdFilterCss(route) : '';
  let style = document.getElementById(AD_FILTER_STYLE_ID);
  if (!css) {
    style?.remove();
  } else {
    if (!style) {
      style = document.createElement('style');
      style.id = AD_FILTER_STYLE_ID;
      document.documentElement.appendChild(style);
    }
    style.textContent = css;
  }
  applyAdFilterFrames(route, active);
}

function applyAllFeatures() {
  // 无视觉副作用的运行标记：用于确认内容脚本已在粉笔页面执行。
  document.documentElement.dataset.kakaoracleFenbiRuntime = isFenbiPage() ? 'ready' : '';
  applyVideoVisibility();
  applyMonochrome();
  applyCsdnBeautify();
  applyZhihuSettings();
  applyCommonMonochrome();
  applyAdFilter();
  applyAiLectureOptimization();
}

let scheduled=false;
new MutationObserver(()=>{
  if (scheduled) return;
  scheduled=true;
  requestAnimationFrame(()=>{
    scheduled=false;
    enhanceQuestions();
    // Angular 会在首屏之后异步插入解析视频，不能只在初始化时处理一次。
    applyAllFeatures();
  });
}).observe(document.body,{childList:true,subtree:true});

function removePanels() {
  document.querySelectorAll('.fcp-comments[data-fcp-source="chrome-extension"]').forEach(panel=>panel.remove());
}

chrome.storage.sync.get(settings,result=>{
  settings={...settings,...result};
  if (settings.fenbiEnabled && settings.forceCommentsEnabled) enhanceQuestions();
  applyAllFeatures();
});

// 订阅数据与站点覆盖配置分别就绪后再应用一次广告过滤。
chrome.storage.local.get({ [AD_DATA_KEY]: null }, stored => {
  if (stored[AD_DATA_KEY]) { adFilterData = stored[AD_DATA_KEY]; adFilterVersion++; }
  applyAdFilter();
});

chrome.storage.sync.get({ adFilterSiteOverrides: {} }, stored => {
  adFilterSiteOverrides = stored.adFilterSiteOverrides || {};
  adFilterVersion++;
  applyAdFilter();
});

chrome.storage.onChanged.addListener((changes,areaName)=>{
  if (areaName==='local') {
    if (changes[AD_DATA_KEY]) { adFilterData = changes[AD_DATA_KEY].newValue || adFilterData; adFilterVersion++; applyAdFilter(); }
    return;
  }
  if (areaName!=='sync') return;
  if (changes.adFilterSiteOverrides) { adFilterSiteOverrides = changes.adFilterSiteOverrides.newValue || {}; adFilterVersion++; }
  for (const key of ['fenbiEnabled','forceCommentsEnabled','hideVideo','monochrome','aiLectureOptimizationEnabled','csdnEnabled','csdnBeautify','csdnMonochrome','csdnPosition','zhihuEnabled','zhihuComments','zhihuMonochrome','commonEnabled','commonMonochrome','adFilterEnabled']) {
    if (changes[key]) settings[key]=changes[key].newValue;
  }
  if (!settings.fenbiEnabled || !settings.forceCommentsEnabled) removePanels(); else enhanceQuestions();
  applyAllFeatures();
});
