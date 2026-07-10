const state = {
  config: null,
  index: null,
  latest: null,
  selectedDate: null,
  showingCodex: false,
};

const statusLabel = {
  pass: "通过",
  conditional: "有条件通过",
  fail: "不通过",
};

async function readJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${path} ${response.status}`);
  }
  return response.json();
}

function statusClass(status) {
  if (status === "pass" || status === "conditional" || status === "fail") {
    return status;
  }
  return "unknown";
}

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function renderTop() {
  const run = state.latest;
  const config = state.config;
  const status = run.verdict.status;
  document.title = config.dashboardTitle;
  setText("projectId", `${config.projectId} Quality Dashboard`);
  setText("dashboardTitle", config.dashboardTitle);
  const verdict = document.getElementById("latestVerdict");
  verdict.textContent = statusLabel[status] || status;
  verdict.style.color = `var(--${statusClass(status)})`;
  setText("latestReason", `${run.date}｜${run.verdict.reason}`);
  setText("checkScore", `${run.checks.passed}/${run.checks.total}`);
  setText("checkDetail", run.checks.failed ? `${run.checks.failed} 个失败` : "全部通过");
  setText("riskScore", String(run.risk.highRiskFiles.length));
  setText("scopeScore", `${run.scope.changedFileCount}/${run.scope.commitCount}`);
  setText("generatedAt", `生成于 ${new Date(state.index.generatedAt).toLocaleString("zh-CN")}`);

  const link = document.getElementById("latestRunLink");
  if (run.source.runUrl) {
    link.href = run.source.runUrl;
  } else {
    link.href = `https://github.com/${config.repository}/actions/workflows/${config.actionsWorkflow}`;
  }

  const retrospective = document.getElementById("retrospectiveLink");
  if (config.repository && config.retrospectivePath) {
    retrospective.href = `https://github.com/${config.repository}/tree/main/${config.retrospectivePath}`;
  }
}

function renderTimeline() {
  const timeline = document.getElementById("timeline");
  const runs = [...state.index.runs].slice(0, 30).reverse();
  timeline.innerHTML = runs
    .map((run) => {
      const height = run.status === "fail" ? 90 : run.status === "conditional" ? 68 : 48;
      return `
        <a class="day ${run.date === state.selectedDate ? "selected" : ""}" href="#${run.date}" data-path="${run.path}" title="${run.date} ${statusLabel[run.status] || run.status}">
          <span class="day-bar ${statusClass(run.status)}" style="height:${height}px"></span>
          <span class="day-label">${run.date.slice(5)}</span>
        </a>
      `;
    })
    .join("");
}

function renderChecks() {
  const checksList = document.getElementById("checksList");
  checksList.innerHTML = state.latest.checks.results
    .map((check) => {
      const ok = check.exitCode === 0;
      return `
        <div class="row">
          <div>
            <div class="row-title">${check.name}</div>
            <div class="row-sub">exit=${check.exitCode}｜${check.durationSeconds}s｜risk=${check.risk}</div>
          </div>
          <span class="pill ${ok ? "pass" : "fail"}">${ok ? "PASS" : "FAIL"}</span>
        </div>
      `;
    })
    .join("");
}

function renderRisk() {
  const riskList = document.getElementById("riskList");
  const files = state.latest.risk.highRiskFiles;
  const failed = state.latest.risk.failedChecks;
  const items = [
    ...failed.map((name) => ({ title: name, sub: "失败检查", status: "fail" })),
    ...files.map((name) => ({ title: name, sub: "高风险文件", status: "conditional" })),
  ];

  if (!items.length) {
    riskList.innerHTML = `
      <div class="row">
        <div>
          <div class="row-title">今天没有高风险缺口</div>
          <div class="row-sub">L0 范围内未发现需要升级处理的问题。</div>
        </div>
        <span class="pill pass">CLEAR</span>
      </div>
    `;
    return;
  }

  riskList.innerHTML = items
    .map(
      (item) => `
        <div class="row">
          <div>
            <div class="row-title">${item.title}</div>
            <div class="row-sub">${item.sub}</div>
          </div>
          <span class="pill ${statusClass(item.status)}">${item.status}</span>
        </div>
      `,
    )
    .join("");
}

function renderReport() {
  const text = state.showingCodex ? state.latest.reports.codexMarkdown : state.latest.reports.dailyMarkdown;
  setText("reportBody", text || "本次运行没有生成 Markdown 报告。");
  setText("toggleCodex", state.showingCodex ? "人类日报" : "Codex 摘要");
}

async function boot() {
  try {
    state.config = await readJson("./site-config.json");
    state.index = await readJson("./data/index.json");
    const initialDate = window.location.hash.replace("#", "");
    const selected = state.index.runs.find((run) => run.date === initialDate) || state.index.runs[0];
    state.latest = await readJson(`./${selected.path}`);
    state.selectedDate = selected.date;
    renderTop();
    renderTimeline();
    renderChecks();
    renderRisk();
    renderReport();
  } catch (error) {
    if (!state.config) {
      state.config = {
        projectId: "project",
        dashboardTitle: "验收报告中心",
        repository: "",
        actionsWorkflow: "daily-acceptance.yml",
        retrospectivePath: "doc/retrospectives",
      };
    }
    setText("projectId", `${state.config.projectId} Quality Dashboard`);
    setText("dashboardTitle", state.config.dashboardTitle);
    setText("latestVerdict", "暂无数据");
    setText("latestReason", "报告中心已部署，等待下一次每日验收写入数据。");
    setText("reportBody", String(error));
  }
}

document.getElementById("toggleCodex").addEventListener("click", () => {
  state.showingCodex = !state.showingCodex;
  renderReport();
});

document.getElementById("timeline").addEventListener("click", async (event) => {
  const link = event.target.closest("a[data-path]");
  if (!link) {
    return;
  }
  event.preventDefault();
  state.latest = await readJson(`./${link.dataset.path}`);
  state.selectedDate = state.latest.date;
  window.history.replaceState(null, "", `#${state.selectedDate}`);
  renderTop();
  renderTimeline();
  renderChecks();
  renderRisk();
  renderReport();
});

boot();
