(()=>{
  'use strict';
  const token=()=>localStorage.getItem('gontu_token')||'';
  const $=id=>document.getElementById(id);
  const state={topics:[],session:null,answer:'',started:0,tick:null};
  const esc=value=>{const node=document.createElement('div');node.textContent=value??'';return node.innerHTML};
  const fmt=ms=>{const s=Math.floor(ms/1000);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};

  async function api(path,options={}){
    if(!token()){
      location.assign('/login.html?next='+encodeURIComponent(location.pathname+location.search));
      throw new Error('请先登录');
    }
    const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token(),...(options.headers||{})}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:'请求未完成');
    return data;
  }

  function fail(error){
    $('error').textContent=error.message;
    $('error').hidden=false;
  }

  function publishCoachContext(session){
    if(!session?.id)return;
    const returnUrl=new URL(location.href);
    returnUrl.searchParams.set('session',session.id);
    const detail={
      moduleId:'quantity.practice',
      contextKind:'activity',
      contextId:`quantity-single:${session.id}`,
      returnUrl:returnUrl.pathname+returnUrl.search+returnUrl.hash,
      label:session.status==='submitted'?'带本题复盘问西西':'带本题进度问西西',
    };
    window.__gontuCoachContext=detail;
    window.GontuV3Shell?.setCoachContext(detail);
    window.dispatchEvent(new CustomEvent('gontu:v3-coach-context',{detail}));
  }

  function render(session){
    state.session=session;
    state.answer=session.final_answer||'';
    state.started=Date.now()-Number(session.elapsed_ms||0);
    $('start').hidden=true;
    $('practice').hidden=false;
    const q=session.question;
    $('meta').innerHTML=[q.primary_topic,q.exam_decision_label,q.estimated_seconds?`建议 ${q.estimated_seconds} 秒`:null]
      .filter(Boolean).map(value=>`<span class="q-pill">${esc(value)}</span>`).join('');
    $('stem').textContent=q.stem;
    $('options').innerHTML=q.options.map(option=>`<button class="q-option${state.answer===option.key?' selected':''}" data-answer="${option.key}"><b>${option.key}</b><span>${esc(option.text)}</span></button>`).join('');
    $('options').querySelectorAll('button').forEach(button=>button.onclick=()=>{
      state.answer=button.dataset.answer;
      $('options').querySelectorAll('button').forEach(item=>item.classList.toggle('selected',item===button));
      $('submitBtn').disabled=false;
    });
    $('stuck').value=session.stuck_step||'';
    $('workNote').value=session.work_note||'';
    clearInterval(state.tick);
    const updateTimer=()=>$('timer').textContent=fmt(Date.now()-state.started);
    updateTimer();
    state.tick=setInterval(updateTimer,1000);
    publishCoachContext(session);
    if(session.status==='submitted')showResult(session);
  }

  async function start(){
    try{
      const topic=$('topic').value||null;
      const session=await api('/api/quantity/single-sessions',{method:'POST',body:JSON.stringify({topic})});
      const url=new URL(location.href);
      url.searchParams.set('session',session.id);
      history.replaceState(null,'',url);
      render(session);
    }catch(error){fail(error)}
  }

  async function submit(){
    if(!state.answer)return;
    try{
      const result=await api(`/api/quantity/single-sessions/${state.session.id}/submit`,{
        method:'POST',
        body:JSON.stringify({
          answer:state.answer,
          elapsed_ms:Math.min(Date.now()-state.started,1800000),
          stuck_step:$('stuck').value||null,
          work_note:$('workNote').value,
        }),
      });
      showResult(result);
    }catch(error){fail(error)}
  }

  function showResult(session){
    state.session=session;
    clearInterval(state.tick);
    publishCoachContext(session);
    const q=session.question;
    $('submitBtn').disabled=true;
    $('options').querySelectorAll('button').forEach(button=>button.disabled=true);
    $('result').hidden=false;
    $('result').className='q-result '+(session.is_correct?'correct':'wrong');
    $('result').innerHTML=`<h3>${session.is_correct?'这题做对了':'这题需要复盘'} · 你的答案 ${esc(session.final_answer)} / 正确答案 ${esc(q.answer)}</h3><p><strong>建议方法：</strong>${esc((q.methods||[]).join('、')||'按原题解析步骤核对')}</p><div class="q-analysis">${esc(q.analysis||'本题暂无文字解析。')}</div><div class="q-actions"><a class="q-btn" href="/quantity-single.html?topic=${encodeURIComponent(session.topic)}">再练一道同题型</a><a class="q-btn secondary" href="/quantity-review.html">查看下一步</a></div>`;
  }

  async function init(){
    try{
      state.topics=await api('/api/quantity/topics');
      $('topic').innerHTML+=state.topics.map(item=>`<option value="${esc(item.topic)}">${esc(item.decision_label)} · ${esc(item.topic)}（${item.question_count}题）</option>`).join('');
      const params=new URLSearchParams(location.search);
      const topic=params.get('topic');
      if(topic)$('topic').value=topic;
      const session=params.get('session');
      if(session)render(await api('/api/quantity/single-sessions/'+encodeURIComponent(session)));
    }catch(error){fail(error)}
  }

  $('startBtn').onclick=start;
  $('submitBtn').onclick=submit;
  init();
})();
