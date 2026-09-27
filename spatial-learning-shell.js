const MODULES_URL="/data/spatial-learning-modules.json";
function currentId(){return document.body.dataset.spatialModule||""}
function publishSpatialCoach(record,label="问西西 · 当前训练"){
  if(!record?.activity_id)return;
  const detail={moduleId:"reasoning.spatial",contextKind:"activity",contextId:record.activity_id,returnUrl:location.pathname+location.search+location.hash,label};
  window.__gontuCoachContext=detail;
  window.GontuV3Shell?.setCoachContext(detail);
  window.dispatchEvent(new CustomEvent("gontu:v3-coach-context",{detail}));
}
window.GontuSpatialCoach=Object.freeze({publish:publishSpatialCoach});
const moduleTitles={
  foundation:"基础截面训练",
  "three-view":"三视图训练",
  "free-cut":"空间几何实验室",
  csg:"组合体切割"
};
const makeBrand=()=>{
  const brand=document.createElement("a");
  brand.className="spatial-stage-brand";brand.href="/spatial-learning.html";brand.setAttribute("aria-label","返回立体图推学习中心");
  brand.innerHTML=`<span class="spatial-stage-brand-mark" aria-hidden="true">公</span><span class="spatial-stage-brand-copy"><strong>${moduleTitles[currentId()]||"立体空间训练"}</strong><small>立体图推 · 空间训练</small></span>`;
  return brand;
};
function mountSharedHeader(){
  const nav=document.querySelector(".product-links")||document.querySelector(".spatial-module-nav")||document.createElement("nav");
  nav.className="spatial-module-nav";nav.setAttribute("aria-label","立体图推学习路径");
  const returnLink=document.createElement("a");
  returnLink.className="spatial-center-link";returnLink.href="/app";returnLink.textContent="返回主要学习环境";
  /*
   * The four spatial tools deliberately share this exact toolbar.  Keeping a
   * single DOM factory here prevents page-local header CSS/markup from slowly
   * drifting apart; only aria-current changes between stages.
   */
  const oldHeader=document.querySelector("header");
  const caseSwitcher=oldHeader?.querySelector(".case-switcher");
  if(caseSwitcher){
    caseSwitcher.classList.add("spatial-stage-accessory");
    document.querySelector(".question-panel")?.prepend(caseSwitcher);
  }
  document.querySelector("#left-panel .spatial-center-link")?.remove();
  const toolbar=document.createElement("header");
  toolbar.className="spatial-stage-toolbar";
  toolbar.setAttribute("data-shared-spatial-header","");
  toolbar.append(makeBrand(),nav,returnLink);
  if(oldHeader)oldHeader.replaceWith(toolbar);else document.body.prepend(toolbar);
  document.body.dataset.spatialShell="ready";
  return nav;
}
async function mount(){
  /* Mount the identical header before any network request so page-local legacy
   * headers never become the visible first frame on slower machines. */
  const nav=mountSharedHeader();
  const response=await fetch(MODULES_URL,{cache:"no-store"});
  if(!response.ok)throw new Error(`空间学习导航载入失败 (${response.status})`);
  const catalog=await response.json();
  nav.replaceChildren(...catalog.modules.map(item=>{const a=document.createElement("a");a.href=item.href;a.textContent=item.title;if(item.id===currentId())a.setAttribute("aria-current","page");return a}));
  localStorage.setItem("gongtu.spatial.preview.last",JSON.stringify({moduleId:currentId(),href:location.pathname,updatedAt:new Date().toISOString()}));
  const auth=window.GontuAuth;
  if(auth?.token()&&currentId()!=="three-view"){
    auth.request("/api/spatial-learning/records",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({stage_id:currentId(),activity_kind:"visit",status:"in_progress",last_position:location.pathname})}).then(async response=>{if(response.ok)publishSpatialCoach(await response.json())}).catch(()=>{});
  }
}
mount().catch(error=>{document.body.dataset.spatialShell="failed";console.error(error)});
