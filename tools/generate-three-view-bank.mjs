import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import {
  VIEW_LABELS,
  VIEW_RULES,
  gridKey,
  projectAllViews,
  validateThreeViewBank,
  validateThreeViewCase,
} from "../three-view-case-engine.js";

const OUTPUT_URL = new URL("../data/three-view-cases/black-white-blocks-50.json", import.meta.url);
const SOURCE_DIR_URL = new URL("../data/images/three-view/sources/", import.meta.url);

const PATTERNS = [
  { target: "main", given: ["top", "left"] },
  { target: "main", given: ["top", "right"] },
  { target: "left", given: ["main", "top"] },
  { target: "right", given: ["main", "top"] },
  { target: "main", given: ["left", "right"] },
];

function mulberry32(seed) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, values) {
  return values[Math.floor(rng() * values.length)];
}

function shuffle(rng, values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function neighbors(position) {
  const [x, y, z] = position;
  return [
    [x + 1, y, z],
    [x - 1, y, z],
    [x, y + 1, z],
    [x, y - 1, z],
    [x, y, z + 1],
    [x, y, z - 1],
  ].filter((item) => item.every((value) => value >= 0 && value <= 2));
}

function positionKey(position) {
  return position.join(",");
}

function allPositions() {
  const positions = [];
  for (let x = 0; x < 3; x += 1) {
    for (let y = 0; y < 3; y += 1) {
      for (let z = 0; z < 3; z += 1) {
        positions.push([x, y, z]);
      }
    }
  }
  return positions;
}

function makeConnectedPositions(rng, targetSize) {
  const occupied = new Map();
  const start = [Math.floor(rng() * 3), 0, Math.floor(rng() * 3)];
  occupied.set(positionKey(start), start);

  while (occupied.size < targetSize) {
    const frontier = [...occupied.values()].flatMap((position) => neighbors(position))
      .filter((position) => !occupied.has(positionKey(position)));
    const next = frontier.length ? pick(rng, frontier) : pick(rng, allPositions());
    occupied.set(positionKey(next), next);
  }

  return [...occupied.values()].sort((a, b) => positionKey(a).localeCompare(positionKey(b)));
}

function paintBlocks(rng, positions, blackCount) {
  const blackKeys = new Set(shuffle(rng, positions).slice(0, blackCount).map(positionKey));
  return positions.map((position) => ({
    position,
    color: blackKeys.has(positionKey(position)) ? "black" : "white",
  }));
}

function countVisibleColored(grid, color) {
  return grid.flat().filter((cell) => cell === color).length;
}

function mutateGrid(rng, baseGrid, variantIndex) {
  const grid = baseGrid.map((row) => [...row]);
  const cells = [];
  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      cells.push([row, col]);
    }
  }

  if (variantIndex === 0) {
    const colored = shuffle(rng, cells).find(([row, col]) => grid[row][col]);
    if (colored) {
      const [row, col] = colored;
      grid[row][col] = grid[row][col] === "black" ? "white" : "black";
    }
  } else if (variantIndex === 1) {
    const colored = shuffle(rng, cells).filter(([row, col]) => grid[row][col]);
    if (colored.length >= 2) {
      const [first, second] = colored;
      [grid[first[0]][first[1]], grid[second[0]][second[1]]] = [
        grid[second[0]][second[1]],
        grid[first[0]][first[1]],
      ];
    }
  } else if (variantIndex === 2) {
    const [row, col] = pick(rng, cells);
    grid[row][col] = grid[row][col] ? null : pick(rng, ["white", "black"]);
  } else {
    const [row, col] = pick(rng, cells);
    grid[row][col] = pick(rng, ["white", "black"]);
  }

  return grid;
}

function buildOptions(rng, targetGrid, projected) {
  const variants = [targetGrid];
  const keys = new Set([gridKey(targetGrid)]);
  const otherViews = Object.values(projected);

  for (const grid of shuffle(rng, otherViews)) {
    if (variants.length >= 4) break;
    const key = gridKey(grid);
    if (!keys.has(key)) {
      keys.add(key);
      variants.push(grid);
    }
  }

  let variantIndex = 0;
  while (variants.length < 4 && variantIndex < 40) {
    const grid = mutateGrid(rng, targetGrid, variantIndex);
    const key = gridKey(grid);
    if (!keys.has(key)) {
      keys.add(key);
      variants.push(grid);
    }
    variantIndex += 1;
  }

  const labels = ["A", "B", "C", "D"];
  const shuffled = shuffle(rng, variants).slice(0, 4);
  return shuffled.map((grid, index) => ({
    id: labels[index],
    label: labels[index],
    grid,
    feedback: "",
  }));
}

function explainFeedback(option, caseData, targetGrid) {
  if (gridKey(option.grid) === gridKey(targetGrid)) {
    return `正确。${caseData.givenViewKeys.map((key) => VIEW_LABELS[key]).join("和")}能同时对上，黑块数量也没有多出来。`;
  }
  const optionBlack = countVisibleColored(option.grid, "black");
  const targetBlack = countVisibleColored(targetGrid, "black");
  if (optionBlack > targetBlack) return `${option.label} 黑格露得太多，说明把后面的黑块直接看到了前面。`;
  if (optionBlack < targetBlack) return `${option.label} 黑格少了，题面两个视图已经锁住的黑块没有全部出现。`;
  return `${option.label} 黑格数量看着差不多，但位置和${VIEW_LABELS[caseData.targetViewKey]}对不上。`;
}

function buildTeaching(caseData) {
  const givenLabels = caseData.givenViewKeys.map((key) => VIEW_LABELS[key]).join("和");
  const targetLabel = VIEW_LABELS[caseData.targetViewKey];
  return {
    short: `先数黑块，再用${givenLabels}锁位置，最后只比${targetLabel}选项差异。`,
    steps: [
      `题目说一共 ${caseData.counts.black} 个黑块，先别急着想立体，先把${givenLabels}里的黑格数量和位置记住。`,
      `${givenLabels}能告诉你黑块大概在哪一列、哪一层；如果某个选项多出黑格，优先怀疑它把后排黑块看到了前面。`,
      `看${targetLabel}时，只看这个方向最外面能挡住视线的方块；前面有白块，后面的黑块不会露出来。`,
      "最后把 A-D 只按差异比较：多黑、少黑、缺格、位置错，通常一眼就能排掉。"
    ],
    optionFocus: caseData.options.map((option) => (
      `${option.label}：${option.feedback}`
    )),
  };
}

function makeCase(index, sourceSample) {
  const rng = mulberry32(20260705 + index * 101);
  const pattern = PATTERNS[(index - 1) % PATTERNS.length];

  for (let attempt = 0; attempt < 500; attempt += 1) {
    const total = 8 + Math.floor(rng() * 11);
    const black = total <= 10 ? pick(rng, [2, 3]) : pick(rng, [2, 3]);
    const positions = makeConnectedPositions(rng, total);
    const blocks = paintBlocks(rng, positions, black);
    const projected = projectAllViews({ blocks, viewRules: VIEW_RULES });
    const targetGrid = projected[pattern.target];

    if (countVisibleColored(targetGrid, "black") === 0) continue;
    if (pattern.given.some((key) => countVisibleColored(projected[key], "black") === 0)) continue;

    const caseId = `threeview-auto-${String(index).padStart(3, "0")}`;
    const white = total - black;
    const caseData = {
      id: caseId,
      groupId: `threeview-group-${String(Math.ceil(index / 5)).padStart(2, "0")}`,
      status: "verified",
      title: `${white}白${black}黑方块三视图`,
      source: {
        type: sourceSample ? "user-screenshot-reference" : "generated",
        sampleId: sourceSample?.id || null,
        image: sourceSample?.image || null,
        note: sourceSample
          ? `参考用户提供截图 ${sourceSample.fileName} 的三视图题型，由程序生成并校验。`
          : "由本地程序生成并校验的三视图训练题。",
      },
      prompt: `下面为${white}个白色块和${black}个黑色块立体图的${pattern.given.map((key) => VIEW_LABELS[key]).join("和")}，那么${VIEW_LABELS[pattern.target]}应该是（ ）。`,
      counts: { white, black, total },
      answer: "",
      viewRules: VIEW_RULES,
      givenViewKeys: pattern.given,
      targetViewKey: pattern.target,
      givenViews: Object.fromEntries(pattern.given.map((key) => [key, projected[key]])),
      targetViews: projected,
      options: buildOptions(rng, targetGrid, projected),
      blocks,
      teaching: { short: "", steps: [], optionFocus: [] },
    };

    const answerOption = caseData.options.find((option) => gridKey(option.grid) === gridKey(targetGrid));
    if (!answerOption) continue;
    caseData.answer = answerOption.id;
    caseData.options = caseData.options.map((option) => ({
      ...option,
      feedback: explainFeedback(option, caseData, targetGrid),
    }));
    caseData.teaching = buildTeaching(caseData);

    const validation = validateThreeViewCase(caseData);
    if (validation.ok) return caseData;
  }

  throw new Error(`failed to generate case ${index}`);
}

async function buildSourceSamples() {
  const files = (await readdir(SOURCE_DIR_URL)).filter((file) => extname(file).toLowerCase() === ".jpg").sort();
  return files.map((file, index) => ({
    id: `source-sample-${String(index + 1).padStart(2, "0")}`,
    fileName: file,
    image: `/data/images/three-view/sources/${file}`,
    status: "reference-screenshot",
    note: "用户提供的三视图训练截图，作为题型来源样本保留。",
  }));
}

async function main() {
  const sourceSamples = await buildSourceSamples();
  const cases = Array.from({ length: 50 }, (_, index) => (
    makeCase(index + 1, sourceSamples[index % sourceSamples.length])
  ));
  const groups = Array.from({ length: 10 }, (_, index) => {
    const start = index * 5;
    return {
      id: `threeview-group-${String(index + 1).padStart(2, "0")}`,
      title: `第 ${index + 1} 组`,
      caseIds: cases.slice(start, start + 5).map((caseData) => caseData.id),
    };
  });
  const bank = {
    id: "black-white-blocks-50",
    version: 1,
    title: "黑白方块三视图 50 题",
    generatedBy: basename(new URL(import.meta.url).pathname),
    generatedAt: "2026-07-05",
    viewRules: VIEW_RULES,
    sourceSamples,
    groups,
    cases,
  };
  const validation = validateThreeViewBank(bank);
  if (!validation.ok) {
    throw new Error(validation.errors.join("\n"));
  }
  await mkdir(new URL("../data/three-view-cases/", import.meta.url), { recursive: true });
  await writeFile(OUTPUT_URL, `${JSON.stringify(bank, null, 2)}\n`);
  console.log(`wrote ${OUTPUT_URL.pathname}`);
}

await main();
