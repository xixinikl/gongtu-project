const MODULES_URL="/data/spatial-learning-modules.json";
function currentId(){return document.body.dataset.spatialModule||""}
async function mount(){
  const response=await fetch(MODULES_URL,{cache:"no-store"});
  if(!response.ok)throw new Error(`空间学习导航载入失败 (${response.status})`);
  const catalog=await response.json();
  const nav=document.querySelector(".product-links")||document.querySelector(".spatial-module-nav")||document.createElement("nav");
  nav.className="spatial-module-nav";nav.setAttribute("aria-label","立体图推学习路径");
  nav.replaceChildren(...catalog.modules.map(item=>{const a=document.createElement("a");a.href=item.href;a.textContent=item.title;if(item.id===currentId())a.setAttribute("aria-current","page");return a}));
  if(!nav.isConnected){nav.classList.add("spatial-shell-fallback");document.body.prepend(nav)}
  const brand=document.querySelector("header .brand");
  if(brand){brand.href="/spatial-learning.html";brand.setAttribute("aria-label","返回立体图推学习中心")}
  document.body.dataset.spatialShell="ready";
  localStorage.setItem("gongtu.spatial.preview.last",JSON.stringify({moduleId:currentId(),href:location.pathname,updatedAt:new Date().toISOString()}));
  const auth=window.GontuAuth;
  if(currentId()!=="three-view"){
    const done=document.createElement("button");
    done.type="button";done.className="spatial-complete-button";done.textContent="完成本阶段学习";
    (nav.parentElement||document.body).insertBefore(done,nav.nextSibling);
    if(auth?.token()){
      const overviewResponse=await auth.request("/api/spatial-learning/overview");
      if(overviewResponse.ok){const overview=await overviewResponse.json();if(overview.stages?.[currentId()]?.status==="completed"){done.textContent="本阶段已完成";done.disabled=true}}
    }
    done.addEventListener("click",async()=>{
      if(!auth?.token()){location.href=auth?.loginUrl(location.pathname)||`/login.html?next=${encodeURIComponent(location.pathname)}`;return}
      done.disabled=true;done.textContent="正在保存…";
      try{
        const response=await auth.request("/api/spatial-learning/records",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({stage_id:currentId(),activity_kind:"task",source_id:`${currentId()}:guided`,status:"completed",last_position:location.pathname,detail:{task:"完成本阶段引导学习"}})});
        if(!response.ok)throw new Error("save failed");done.textContent="本阶段已完成";
      }catch{done.disabled=false;done.textContent="保存失败，点击重试"}
    });
  }
  if(auth?.token()&&currentId()!=="three-view"){
    auth.request("/api/spatial-learning/records",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({stage_id:currentId(),activity_kind:"visit",status:"in_progress",last_position:location.pathname})}).catch(()=>{});
  }
}
mount().catch(error=>{document.body.dataset.spatialShell="failed";console.error(error)});
