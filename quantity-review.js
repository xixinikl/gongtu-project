(()=>{
  'use strict';
  const token=()=>localStorage.getItem('gontu_token')||'';
  const esc=value=>{const node=document.createElement('div');node.textContent=value??'';return node.innerHTML};
  const fmt=ms=>{const s=Math.round((ms||0)/1000);return s>=60?`${Math.floor(s/60)}分${s%60}秒`:`${s}秒`};

  async function init(){
    if(!token()){
      location.assign('/login.html?next='+encodeURIComponent(location.pathname));
      return;
    }
    try{
      const response=await fetch('/api/quantity/review-summary',{headers:{Authorization:'Bearer '+token()}});
      const data=await response.json();
      if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:'复盘读取失败');

      document.getElementById('stats').innerHTML=`
        <div class="review-stat"><strong>${data.evidence_count}</strong><span>条真实训练证据</span></div>
        <div class="review-stat"><strong>${data.single_count}</strong><span>道单题诊断</span></div>
        <div class="review-stat"><strong>${data.set_count}</strong><span>套已交卷训练</span></div>`;

      const rec=data.recommendation;
      document.getElementById('recommendation').innerHTML=`
        <div class="q-eyebrow">下一步做什么</div>
        <h2>${esc(rec.topic)}专项</h2>
        <p class="q-muted">${esc(rec.reason)}</p>
        <a class="q-btn" href="/quantity-single.html?topic=${encodeURIComponent(rec.topic)}">现在开始下一题</a>`;

      document.getElementById('topics').innerHTML=data.topic_reviews.length
        ?data.topic_reviews.map(item=>{
          const confidence=item.needed_for_stable
            ?`当前 ${item.attempted}/5 题，仍需 ${item.needed_for_stable} 题再判断是否稳定`
            :'已达到 5 题基础证据，可继续观察趋势';
          return `<div class="q-row"><div>
            <strong>${esc(item.topic)} · ${Math.round(item.accuracy*100)}%</strong>
            <span>平均 ${item.average_seconds} 秒${item.top_stuck_step?'，常卡在'+esc(item.top_stuck_step):''}</span>
            <span class="q-evidence-note">${confidence}</span>
          </div><a class="q-btn secondary" href="/quantity-single.html?topic=${encodeURIComponent(item.topic)}">继续练</a></div>`;
        }).join('')
        :'<div class="q-empty">还没有单题记录。先做一道题，才能判断问题是否稳定。</div>';

      document.getElementById('timeline').innerHTML=data.timeline.length
        ?data.timeline.map(item=>`<article><strong>${esc(item.title)} · ${esc(item.result)}</strong><span>${fmt(item.elapsed_ms)} · ${new Date(item.updated_at).toLocaleString('zh-CN')}</span>${item.kind==='set'?`<a href="/quantity-practice.html?view=review&amp;session=${encodeURIComponent(item.id)}">打开逐题复盘</a>`:''}</article>`).join('')
        :'<div class="q-empty">完成训练后，这里会按时间显示记录。</div>';
    }catch(error){
      const node=document.getElementById('error');
      node.textContent=error.message;
      node.hidden=false;
    }
  }
  init();
})();
