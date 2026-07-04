import * as THREE from "three";

const SHAPES = {
  cube: {
    name: "正方体",
    summary: "六个面完全相同，直边截面最多 6 条边。",
    can: ["等边三角形", "直角三角形", "正方形", "长方形", "梯形", "五边形", "六边形"],
    cannot: ["圆", "椭圆", "曲边图形", "超过 6 条边"],
    rule: "正方体每个面都是平面，所以截面只能由直线段围成；切到几个面，就最多出现几条边。",
    icon: "cube",
    demos: [
      {
        id: "cube-hexagon",
        verdict: "can",
        label: "可行",
        title: "正方体可以截出六边形",
        note: "切面同时穿过正方体的六个面，截面就是六条直边围成的六边形。不能再说“正方体截不出六边形”。",
        cut: "cubeHexCut",
        section: "hexagon",
      },
      {
        id: "cube-triangle",
        verdict: "can",
        label: "可行",
        title: "切到一个角可以出三角形",
        note: "平面只削过一个顶角附近的三个面，三个交线段闭合成三角形。",
        cut: "cubeTriangleCut",
        section: "triangle",
      },
      {
        id: "cube-circle",
        verdict: "cannot",
        label: "不可行",
        title: "正方体不能直接截出圆",
        note: "正方体没有曲面，平面与它的每个面相交都只能得到直线段，所以不会得到圆或椭圆。",
        cut: "cubeCircleCut",
        section: "circleNo",
      },
    ],
  },
  cuboid: {
    name: "长方体",
    summary: "比例不同，但截面仍然只由直线段组成。",
    can: ["直角三角形", "矩形", "平行四边形", "梯形", "五边形", "六边形"],
    cannot: ["圆", "椭圆", "任意曲边", "超过 6 条边"],
    rule: "长方体与正方体同属六面体，能出六边形，但比例会拉长或压扁。",
    icon: "cuboid",
    demos: [
      {
        id: "cuboid-rectangle",
        verdict: "can",
        label: "可行",
        title: "平行于某个面可得矩形",
        note: "切面与一组侧面平行时，截面保持矩形，这是长方体最常见的基础截面。",
        cut: "cuboidRectangleCut",
        section: "rectangle",
      },
      {
        id: "cuboid-hexagon",
        verdict: "can",
        label: "可行",
        title: "斜切也可以出六边形",
        note: "只要切面穿过六个面，长方体也能得到六边形；只是边长不一定相等。",
        cut: "cuboidHexCut",
        section: "wideHexagon",
      },
      {
        id: "cuboid-ellipse",
        verdict: "cannot",
        label: "不可行",
        title: "长方体不会直接出椭圆",
        note: "所有表面都是平面，截痕没有曲线来源，椭圆一定要警惕是不是来自圆柱或圆锥。",
        cut: "cuboidEllipseCut",
        section: "ellipseNo",
      },
    ],
  },
  cylinder: {
    name: "圆柱",
    summary: "有曲面，常见圆、椭圆和轴向矩形。",
    can: ["圆", "椭圆", "矩形", "带弧边截面"],
    cannot: ["纯三角形", "纯五边形", "纯六边形", "只有直边的复杂多边形"],
    rule: "圆柱的曲边来自侧面；垂直轴线是圆，斜切必然带曲边并形成椭圆，平行轴线常见矩形。",
    icon: "cylinder",
    demos: [
      {
        id: "cylinder-circle",
        verdict: "can",
        label: "可行",
        title: "横切圆柱得到圆",
        note: "切面垂直圆柱轴线，截面和底面平行，所以得到圆。",
        cut: "cylinderCircleCut",
        section: "circle",
      },
      {
        id: "cylinder-ellipse",
        verdict: "can",
        label: "可行",
        title: "斜切圆柱得到椭圆",
        note: "切面倾斜穿过圆柱侧面，圆形被投影拉长，截面就是椭圆。",
        cut: "cylinderEllipseCut",
        section: "ellipse",
      },
      {
        id: "cylinder-triangle",
        verdict: "cannot",
        label: "不可行",
        title: "圆柱不能出纯三角形",
        note: "圆柱侧面会带来曲线，平面不可能只留下三条直边组成的纯三角形。",
        cut: "cylinderTriangleCut",
        section: "triangleNo",
      },
    ],
  },
  cone: {
    name: "圆锥",
    summary: "水平圆、斜切椭圆，过顶点会出现母线三角形。",
    can: ["圆", "椭圆", "过顶点等腰三角形", "非过顶点曲边截面"],
    cannot: ["纯正方形", "纯六边形", "无曲线多边形"],
    rule: "圆锥截面要先问是否过顶点：过顶点看直母线，不过顶点常见圆或椭圆。",
    icon: "cone",
    demos: [
      {
        id: "cone-triangle",
        verdict: "can",
        label: "可行",
        title: "过顶点能出三角形",
        note: "切面经过圆锥顶点和底面，左右两条母线成为三角形的两条边。",
        cut: "coneTriangleCut",
        section: "triangle",
      },
      {
        id: "cone-ellipse",
        verdict: "can",
        label: "可行",
        title: "不过顶点斜切能出椭圆",
        note: "切面斜穿圆锥侧面且不经过顶点时，圆锥侧面贡献椭圆类曲线。",
        cut: "coneEllipseCut",
        section: "ellipse",
      },
      {
        id: "cone-hexagon",
        verdict: "cannot",
        label: "不可行",
        title: "圆锥本身不能出纯六边形",
        note: "圆锥有曲面或母线，单独切它不会得到一个全是直边的干净六边形。",
        cut: "coneHexCut",
        section: "hexagonNo",
      },
    ],
  },
  pyramid: {
    name: "棱锥",
    summary: "所有侧面都是平面，截面是直边多边形。",
    can: ["三角形", "四边形", "梯形", "五边形"],
    cannot: ["圆", "椭圆", "曲边图形"],
    rule: "棱锥没有曲面，截面都是直线段；斜切时常见缺角和不规则多边形。",
    icon: "pyramid",
    demos: [
      {
        id: "pyramid-triangle",
        verdict: "can",
        label: "可行",
        title: "切过侧面可得三角形",
        note: "切面碰到三块平面侧面，三条直线段闭合成三角形。",
        cut: "pyramidTriangleCut",
        section: "triangle",
      },
      {
        id: "pyramid-quad",
        verdict: "can",
        label: "可行",
        title: "斜切可得四边形",
        note: "切面穿过四个侧面或底面相关区域，会得到不规则四边形或梯形。",
        cut: "pyramidQuadCut",
        section: "quad",
      },
      {
        id: "pyramid-ellipse",
        verdict: "cannot",
        label: "不可行",
        title: "棱锥不能直接出椭圆",
        note: "每个面都是平面，截痕全是直线段；椭圆说明题里还有圆柱、圆锥或曲面。",
        cut: "pyramidEllipseCut",
        section: "ellipseNo",
      },
    ],
  },
};

const DRAWINGS = {
  cube: `<svg viewBox="0 0 120 120"><path class="solid" d="M26 42 L60 25 L94 42 L94 82 L60 101 L26 82 Z"/><path class="solid" d="M26 42 L60 59 L94 42"/><path class="hidden" d="M60 59 L60 101"/></svg>`,
  cuboid: `<svg viewBox="0 0 120 120"><path class="solid" d="M18 48 L65 31 L102 45 L102 79 L55 97 L18 83 Z"/><path class="solid" d="M18 48 L55 62 L102 45"/><path class="hidden" d="M55 62 L55 97"/></svg>`,
  cylinder: `<svg viewBox="0 0 120 120"><ellipse class="solid" cx="60" cy="34" rx="32" ry="14"/><path class="solid" d="M28 34 L28 83 C28 102 92 102 92 83 L92 34"/><ellipse class="hidden" cx="60" cy="83" rx="32" ry="14"/></svg>`,
  cone: `<svg viewBox="0 0 120 120"><ellipse class="solid" cx="60" cy="36" rx="36" ry="14"/><path class="solid" d="M24 36 L60 103 L96 36"/><path class="hidden" d="M24 36 C24 54 96 54 96 36"/></svg>`,
  pyramid: `<svg viewBox="0 0 120 120"><path class="solid" d="M60 18 L25 88 L94 88 Z"/><path class="solid" d="M60 18 L101 64 L94 88"/><path class="hidden" d="M25 88 L101 64"/></svg>`,
  cubeHexCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M78 70 L160 31 L242 70 L242 151 L160 192 L78 151 Z"/><path class="solid" d="M78 70 L160 111 L242 70"/><path class="hidden" d="M160 111 L160 192"/><path class="plane" d="M96 122 L126 88 L160 74 L194 88 L224 122 L190 158 L130 158 Z"/><path class="section-line" d="M126 88 L160 74 L194 88 L224 122 L190 158 L130 158 L96 122 Z"/></svg>`,
  cubeTriangleCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M78 70 L160 31 L242 70 L242 151 L160 192 L78 151 Z"/><path class="solid" d="M78 70 L160 111 L242 70"/><path class="plane" d="M99 82 L153 44 L145 116 Z"/></svg>`,
  cubeRightTriangleCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M78 70 L160 31 L242 70 L242 151 L160 192 L78 151 Z"/><path class="solid" d="M78 70 L160 111 L242 70"/><path class="plane" d="M96 151 L96 94 L184 151 Z"/></svg>`,
  cubeSquareCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M78 70 L160 31 L242 70 L242 151 L160 192 L78 151 Z"/><path class="solid" d="M78 70 L160 111 L242 70"/><path class="hidden" d="M160 111 L160 192"/><path class="plane" d="M107 88 L160 62 L213 88 L160 116 Z"/></svg>`,
  cubeRectangleCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M78 70 L160 31 L242 70 L242 151 L160 192 L78 151 Z"/><path class="solid" d="M78 70 L160 111 L242 70"/><path class="plane" d="M92 104 L206 70 L226 110 L112 145 Z"/></svg>`,
  cubeTrapezoidCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M78 70 L160 31 L242 70 L242 151 L160 192 L78 151 Z"/><path class="solid" d="M78 70 L160 111 L242 70"/><path class="plane" d="M104 95 L200 82 L222 132 L86 148 Z"/></svg>`,
  cubePentagonCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M78 70 L160 31 L242 70 L242 151 L160 192 L78 151 Z"/><path class="solid" d="M78 70 L160 111 L242 70"/><path class="hidden" d="M160 111 L160 192"/><path class="plane" d="M99 118 L127 82 L187 72 L225 112 L184 158 L122 154 Z"/></svg>`,
  cubeCircleCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M78 70 L160 31 L242 70 L242 151 L160 192 L78 151 Z"/><path class="solid" d="M78 70 L160 111 L242 70"/><ellipse class="plane impossible-shape" cx="160" cy="116" rx="54" ry="34"/><line class="nope" x1="111" y1="156" x2="209" y2="76"/></svg>`,
  cubeCurvedCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M78 70 L160 31 L242 70 L242 151 L160 192 L78 151 Z"/><path class="solid" d="M78 70 L160 111 L242 70"/><path class="curve impossible-shape" d="M94 138 C126 68 196 70 226 138"/><line class="nope" x1="111" y1="158" x2="210" y2="76"/></svg>`,
  cubeTooManyCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M78 70 L160 31 L242 70 L242 151 L160 192 L78 151 Z"/><path class="solid" d="M78 70 L160 111 L242 70"/><path class="plane impossible-shape" d="M160 65 L196 72 L222 100 L224 132 L198 160 L160 168 L122 160 L96 132 L98 100 L124 72 Z"/><line class="nope" x1="110" y1="158" x2="212" y2="72"/></svg>`,
  cuboidRectangleCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M48 82 L160 42 L270 80 L270 144 L157 184 L48 146 Z"/><path class="solid" d="M48 82 L157 120 L270 80"/><path class="plane" d="M88 73 L217 73 L217 168 L88 168 Z"/></svg>`,
  cuboidHexCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M43 83 L160 42 L276 81 L276 145 L158 185 L43 148 Z"/><path class="solid" d="M43 83 L158 121 L276 81"/><path class="plane" d="M72 126 L130 75 L230 83 L256 130 L196 176 L96 168 Z"/></svg>`,
  cuboidEllipseCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M45 83 L158 43 L275 82 L275 144 L157 184 L45 148 Z"/><ellipse class="plane" cx="160" cy="118" rx="80" ry="35"/><line class="nope" x1="95" y1="164" x2="224" y2="72"/></svg>`,
  cuboidTriangleCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M43 83 L160 42 L276 81 L276 145 L158 185 L43 148 Z"/><path class="solid" d="M43 83 L158 121 L276 81"/><path class="plane" d="M67 146 L67 94 L176 146 Z"/></svg>`,
  cuboidParallelogramCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M43 83 L160 42 L276 81 L276 145 L158 185 L43 148 Z"/><path class="solid" d="M43 83 L158 121 L276 81"/><path class="plane" d="M84 107 L225 78 L242 124 L100 153 Z"/></svg>`,
  cuboidTrapezoidCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M43 83 L160 42 L276 81 L276 145 L158 185 L43 148 Z"/><path class="solid" d="M43 83 L158 121 L276 81"/><path class="plane" d="M84 100 L220 92 L254 139 L64 154 Z"/></svg>`,
  cuboidPentagonCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M43 83 L160 42 L276 81 L276 145 L158 185 L43 148 Z"/><path class="solid" d="M43 83 L158 121 L276 81"/><path class="plane" d="M70 128 L124 76 L222 86 L254 130 L194 174 L92 164 Z"/></svg>`,
  cuboidCurvedCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M43 83 L160 42 L276 81 L276 145 L158 185 L43 148 Z"/><path class="solid" d="M43 83 L158 121 L276 81"/><path class="curve impossible-shape" d="M78 142 C120 65 205 66 246 142"/><line class="nope" x1="95" y1="164" x2="224" y2="72"/></svg>`,
  cuboidTooManyCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M43 83 L160 42 L276 81 L276 145 L158 185 L43 148 Z"/><path class="solid" d="M43 83 L158 121 L276 81"/><path class="plane impossible-shape" d="M104 94 L150 70 L205 76 L244 104 L252 138 L214 168 L156 174 L98 156 L74 122 Z"/><line class="nope" x1="95" y1="164" x2="224" y2="72"/></svg>`,
  cylinderCircleCut: `<svg viewBox="0 0 320 220"><ellipse class="solid" cx="160" cy="56" rx="72" ry="24"/><path class="solid" d="M88 56 L88 154 C88 189 232 189 232 154 L232 56"/><ellipse class="plane" cx="160" cy="102" rx="72" ry="24"/></svg>`,
  cylinderEllipseCut: `<svg viewBox="0 0 320 220"><ellipse class="solid" cx="160" cy="54" rx="72" ry="24"/><path class="solid" d="M88 54 L88 154 C88 189 232 189 232 154 L232 54"/><path class="plane" d="M88 132 C118 90 202 72 232 98 C202 140 118 158 88 132 Z"/></svg>`,
  cylinderTriangleCut: `<svg viewBox="0 0 320 220"><ellipse class="solid" cx="160" cy="54" rx="72" ry="24"/><path class="solid" d="M88 54 L88 154 C88 189 232 189 232 154 L232 54"/><path class="plane" d="M106 150 L160 62 L214 150 Z"/><line class="nope" x1="108" y1="166" x2="212" y2="65"/></svg>`,
  cylinderRectangleCut: `<svg viewBox="0 0 320 220"><ellipse class="solid" cx="160" cy="54" rx="72" ry="24"/><path class="solid" d="M88 54 L88 154 C88 189 232 189 232 154 L232 54"/><path class="plane" d="M126 56 L194 56 L194 160 L126 160 Z"/></svg>`,
  cylinderArcCut: `<svg viewBox="0 0 320 220"><ellipse class="solid" cx="160" cy="54" rx="72" ry="24"/><path class="solid" d="M88 54 L88 154 C88 189 232 189 232 154 L232 54"/><path class="plane" d="M104 148 L216 148 C205 92 116 92 104 148 Z"/></svg>`,
  cylinderHexCut: `<svg viewBox="0 0 320 220"><ellipse class="solid" cx="160" cy="54" rx="72" ry="24"/><path class="solid" d="M88 54 L88 154 C88 189 232 189 232 154 L232 54"/><path class="plane impossible-shape" d="M108 108 L132 76 L188 76 L214 108 L190 150 L130 150 Z"/><line class="nope" x1="108" y1="166" x2="212" y2="65"/></svg>`,
  coneTriangleCut: `<svg viewBox="0 0 320 220"><ellipse class="solid" cx="160" cy="58" rx="78" ry="25"/><path class="solid" d="M82 58 L160 194 L238 58"/><path class="plane" d="M117 57 L160 194 L203 57 Z"/></svg>`,
  coneEllipseCut: `<svg viewBox="0 0 320 220"><ellipse class="solid" cx="160" cy="58" rx="78" ry="25"/><path class="solid" d="M82 58 L160 194 L238 58"/><path class="plane" d="M105 98 C128 73 200 70 222 96 C198 123 129 125 105 98 Z"/></svg>`,
  coneHexCut: `<svg viewBox="0 0 320 220"><ellipse class="solid" cx="160" cy="58" rx="78" ry="25"/><path class="solid" d="M82 58 L160 194 L238 58"/><path class="plane" d="M118 98 L143 78 L177 78 L202 98 L184 128 L136 128 Z"/><line class="nope" x1="112" y1="150" x2="210" y2="75"/></svg>`,
  coneCircleCut: `<svg viewBox="0 0 320 220"><ellipse class="solid" cx="160" cy="58" rx="78" ry="25"/><path class="solid" d="M82 58 L160 194 L238 58"/><ellipse class="plane" cx="160" cy="92" rx="55" ry="18"/></svg>`,
  coneCurveCut: `<svg viewBox="0 0 320 220"><ellipse class="solid" cx="160" cy="58" rx="78" ry="25"/><path class="solid" d="M82 58 L160 194 L238 58"/><path class="plane" d="M115 126 C132 95 190 88 214 110 C196 145 136 151 115 126 Z"/></svg>`,
  coneSquareCut: `<svg viewBox="0 0 320 220"><ellipse class="solid" cx="160" cy="58" rx="78" ry="25"/><path class="solid" d="M82 58 L160 194 L238 58"/><path class="plane impossible-shape" d="M118 88 L202 88 L202 154 L118 154 Z"/><line class="nope" x1="112" y1="150" x2="210" y2="75"/></svg>`,
  pyramidTriangleCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M160 32 L82 176 L238 176 Z"/><path class="solid" d="M160 32 L258 126 L238 176"/><path class="plane" d="M125 119 L160 55 L197 119 Z"/></svg>`,
  pyramidQuadCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M160 32 L82 176 L238 176 Z"/><path class="solid" d="M160 32 L258 126 L238 176"/><path class="plane" d="M106 134 L145 82 L218 122 L198 166 Z"/></svg>`,
  pyramidEllipseCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M160 32 L82 176 L238 176 Z"/><path class="solid" d="M160 32 L258 126 L238 176"/><ellipse class="plane" cx="160" cy="126" rx="65" ry="32"/><line class="nope" x1="105" y1="166" x2="218" y2="77"/></svg>`,
  pyramidTrapezoidCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M160 32 L82 176 L238 176 Z"/><path class="solid" d="M160 32 L258 126 L238 176"/><path class="plane" d="M119 112 L182 91 L228 138 L101 155 Z"/></svg>`,
  pyramidPentagonCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M160 32 L82 176 L238 176 Z"/><path class="solid" d="M160 32 L258 126 L238 176"/><path class="plane" d="M111 139 L137 91 L202 106 L231 143 L190 168 L106 166 Z"/></svg>`,
  pyramidCircleCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M160 32 L82 176 L238 176 Z"/><path class="solid" d="M160 32 L258 126 L238 176"/><circle class="plane impossible-shape" cx="160" cy="126" r="45"/><line class="nope" x1="105" y1="166" x2="218" y2="77"/></svg>`,
  pyramidCurvedCut: `<svg viewBox="0 0 320 220"><path class="solid" d="M160 32 L82 176 L238 176 Z"/><path class="solid" d="M160 32 L258 126 L238 176"/><path class="curve impossible-shape" d="M104 143 C129 76 200 80 230 143"/><line class="nope" x1="105" y1="166" x2="218" y2="77"/></svg>`,
  triangle: `<svg viewBox="0 0 320 220"><path class="section" d="M160 48 L235 174 L85 174 Z"/></svg>`,
  rightTriangle: `<svg viewBox="0 0 320 220"><path class="section" d="M96 58 L96 168 L238 168 Z"/></svg>`,
  rectangle: `<svg viewBox="0 0 320 220"><path class="section" d="M82 70 L238 70 L238 160 L82 160 Z"/></svg>`,
  square: `<svg viewBox="0 0 320 220"><path class="section" d="M104 54 L216 54 L216 166 L104 166 Z"/></svg>`,
  trapezoid: `<svg viewBox="0 0 320 220"><path class="section" d="M112 66 L207 66 L242 158 L78 158 Z"/></svg>`,
  parallelogram: `<svg viewBox="0 0 320 220"><path class="section" d="M112 70 L246 70 L208 158 L74 158 Z"/></svg>`,
  pentagon: `<svg viewBox="0 0 320 220"><path class="section" d="M160 48 L232 94 L204 168 L116 168 L88 94 Z"/></svg>`,
  quad: `<svg viewBox="0 0 320 220"><path class="section" d="M82 142 L130 60 L240 92 L218 168 Z"/></svg>`,
  hexagon: `<svg viewBox="0 0 320 220"><path class="section" d="M101 110 L132 58 L189 58 L219 110 L189 162 L132 162 Z"/></svg>`,
  wideHexagon: `<svg viewBox="0 0 320 220"><path class="section" d="M82 112 L130 62 L215 72 L244 112 L196 160 L112 150 Z"/></svg>`,
  circle: `<svg viewBox="0 0 320 220"><circle class="section" cx="160" cy="110" r="62"/></svg>`,
  ellipse: `<svg viewBox="0 0 320 220"><ellipse class="section" cx="160" cy="110" rx="88" ry="48"/></svg>`,
  circleNo: `<svg viewBox="0 0 320 220"><circle class="section" cx="160" cy="110" r="62"/><line class="nope" x1="103" y1="167" x2="217" y2="53"/></svg>`,
  ellipseNo: `<svg viewBox="0 0 320 220"><ellipse class="section" cx="160" cy="110" rx="88" ry="48"/><line class="nope" x1="92" y1="171" x2="229" y2="49"/></svg>`,
  curvedNo: `<svg viewBox="0 0 320 220"><path class="curve" d="M78 136 C116 52 203 54 242 136"/><line class="nope" x1="96" y1="170" x2="224" y2="50"/></svg>`,
  tooManyNo: `<svg viewBox="0 0 320 220"><path class="section" d="M160 48 L207 62 L238 102 L232 150 L190 178 L140 178 L88 148 L82 98 L112 62 Z"/><line class="nope" x1="98" y1="174" x2="224" y2="48"/></svg>`,
  triangleNo: `<svg viewBox="0 0 320 220"><path class="section" d="M160 48 L235 174 L85 174 Z"/><line class="nope" x1="103" y1="167" x2="217" y2="53"/></svg>`,
  hexagonNo: `<svg viewBox="0 0 320 220"><path class="section" d="M101 110 L132 58 L189 58 L219 110 L189 162 L132 162 Z"/><line class="nope" x1="103" y1="167" x2="217" y2="53"/></svg>`,
  arcSection: `<svg viewBox="0 0 320 220"><path class="section" d="M82 152 L238 152 C222 80 98 80 82 152 Z"/></svg>`,
};

const SECTION_DRAWING_BY_LABEL = {
  "等边三角形": "triangle",
  "直角三角形": "rightTriangle",
  "三角形": "triangle",
  "过顶点等腰三角形": "triangle",
  "正方形": "square",
  "长方形": "rectangle",
  "矩形": "rectangle",
  "平行四边形": "parallelogram",
  "四边形": "quad",
  "梯形": "trapezoid",
  "五边形": "pentagon",
  "六边形": "hexagon",
  "圆": "circle",
  "椭圆": "ellipse",
  "圆锥曲线": "ellipse",
  "带弧边截面": "arcSection",
  "曲边图形": "curvedNo",
  "任意曲边": "curvedNo",
  "非过顶点曲边截面": "arcSection",
  "纯三角形": "triangleNo",
  "纯五边形": "pentagon",
  "纯六边形": "hexagonNo",
  "只有直边的复杂多边形": "hexagonNo",
  "超过 6 条边": "tooManyNo",
  "纯正方形": "square",
  "无曲线多边形": "hexagonNo",
};

const SOLID_SECTION_DRAWING = {
  cube: {
    "等边三角形": "cubeTriangleCut",
    "直角三角形": "cubeRightTriangleCut",
    "正方形": "cubeSquareCut",
    "长方形": "cubeRectangleCut",
    "梯形": "cubeTrapezoidCut",
    "五边形": "cubePentagonCut",
    "六边形": "cubeHexCut",
    "圆": "cubeCircleCut",
    "椭圆": "cubeCircleCut",
    "曲边图形": "cubeCurvedCut",
    "超过 6 条边": "cubeTooManyCut",
  },
  cuboid: {
    "直角三角形": "cuboidTriangleCut",
    "矩形": "cuboidRectangleCut",
    "平行四边形": "cuboidParallelogramCut",
    "梯形": "cuboidTrapezoidCut",
    "五边形": "cuboidPentagonCut",
    "六边形": "cuboidHexCut",
    "圆": "cuboidEllipseCut",
    "椭圆": "cuboidEllipseCut",
    "任意曲边": "cuboidCurvedCut",
    "超过 6 条边": "cuboidTooManyCut",
  },
  cylinder: {
    "圆": "cylinderCircleCut",
    "椭圆": "cylinderEllipseCut",
    "矩形": "cylinderRectangleCut",
    "带弧边截面": "cylinderArcCut",
    "纯三角形": "cylinderTriangleCut",
    "纯五边形": "cylinderHexCut",
    "纯六边形": "cylinderHexCut",
    "只有直边的复杂多边形": "cylinderHexCut",
  },
  cone: {
    "圆": "coneCircleCut",
    "椭圆": "coneEllipseCut",
    "过顶点等腰三角形": "coneTriangleCut",
    "非过顶点曲边截面": "coneCurveCut",
    "纯正方形": "coneSquareCut",
    "纯六边形": "coneHexCut",
    "无曲线多边形": "coneHexCut",
  },
  pyramid: {
    "三角形": "pyramidTriangleCut",
    "四边形": "pyramidQuadCut",
    "梯形": "pyramidTrapezoidCut",
    "五边形": "pyramidPentagonCut",
    "圆": "pyramidCircleCut",
    "椭圆": "pyramidEllipseCut",
    "曲边图形": "pyramidCurvedCut",
  },
};

const elements = {
  solidList: document.querySelector("#solid-list"),
  solidTag: document.querySelector("#solid-tag"),
  knowledgeGrid: document.querySelector("#knowledge-grid"),
  solidRule: document.querySelector("#solid-rule"),
  demoButtons: document.querySelector("#demo-buttons"),
  demoVerdict: document.querySelector("#demo-verdict"),
  canvas: document.querySelector("#foundation-3d"),
  resetSection: document.querySelector("#reset-section"),
  dragStatus: document.querySelector("#drag-status"),
  liveSectionCard: document.querySelector(".live-section-card"),
  liveSectionSvg: document.querySelector("#live-section-svg"),
  liveSectionVerdict: document.querySelector("#live-section-verdict"),
  liveSectionCaption: document.querySelector("#live-section-caption"),
  demoLabel: document.querySelector("#demo-label"),
  demoTitle: document.querySelector("#demo-title"),
  demoCopy: document.querySelector("#demo-copy"),
};

const state = {
  solidId: "cube",
  demoId: "cube-hexagon",
  selectedLabel: "六边形",
  selectedVerdict: "can",
  sectionOffset: 0,
};

const DEMO_FOCUS_LABEL = {
  "cube-hexagon": "六边形",
  "cube-triangle": "等边三角形",
  "cube-circle": "圆",
  "cuboid-rectangle": "矩形",
  "cuboid-hexagon": "六边形",
  "cuboid-ellipse": "椭圆",
  "cylinder-circle": "圆",
  "cylinder-ellipse": "椭圆",
  "cylinder-triangle": "纯三角形",
  "cone-triangle": "过顶点等腰三角形",
  "cone-ellipse": "椭圆",
  "cone-hexagon": "纯六边形",
  "pyramid-triangle": "三角形",
  "pyramid-quad": "四边形",
  "pyramid-ellipse": "椭圆",
};

const POSITION_RULES = {
  cube: {
    "等边三角形": "切面只削过正方体一个顶角附近的三个面，三个交线段闭合成三角形；当三个面被切得均衡时，截面接近等边三角形。",
    "直角三角形": "切面贴近一个角，并且更偏向其中两条互相垂直的棱，截面就会呈现直角三角形。",
    "正方形": "切面与正方体某一组面平行，从中间水平或竖直穿过，截面就是正方形。",
    "长方形": "切面与一组棱平行，同时斜穿两个相对面，截面会被拉成长方形。",
    "梯形": "切面斜着穿过上下面和部分侧面，一边长一边短，就会出现梯形。",
    "五边形": "切面避开一个顶角，但同时碰到正方体的五个面，五条交线段会围成五边形。",
    "六边形": "切面从一个角的附近斜穿到对角附近，同时经过正方体的六个面；只要六个面都被同一平面切到，就能出现六边形。",
    "圆": "正方体所有表面都是平面，切面与每个面相交都只能得到直线段；无论放在哪里，都不能直接得到圆。",
    "椭圆": "椭圆必须来自曲面。正方体没有曲面，所以切面斜放也只能得到直边多边形，不会得到椭圆。",
    "曲边图形": "曲边需要圆柱、圆锥这类曲面提供。正方体只有平面，截面边界不会弯。",
    "超过 6 条边": "正方体只有六个面，一个平面最多和六个面各形成一条边，所以单个截面最多六边。",
  },
  cuboid: {
    "直角三角形": "切面削过长方体一个角附近的三个面，就能得到三角形；角度贴近垂直棱时会接近直角三角形。",
    "矩形": "切面平行于长方体的一组面，或者沿着一组平行侧面切入，截面就是矩形。",
    "平行四边形": "切面与一组棱保持平行，同时斜穿相对面，截面会成为平行四边形。",
    "梯形": "切面斜穿长方体时，上下两条截线长短不同，就会出现梯形。",
    "五边形": "切面同时碰到五个面，并避开第六个面，截面就是五边形。",
    "六边形": "切面同时穿过长方体六个面，能得到六边形；只是长方体比例不同，六边形通常会被拉长。",
    "圆": "长方体没有曲面，切面放在哪里都不会直接形成圆。",
    "椭圆": "椭圆来自曲面，长方体表面全是平面，所以只能得到直边图形。",
    "任意曲边": "长方体的截面边界只能来自平面和平面的交线，因此不会出现任意曲边。",
    "超过 6 条边": "长方体也是六面体，单个平面最多切到六个面，不能出现超过六条边的单一截面。",
  },
  cylinder: {
    "圆": "切面与圆柱底面平行，也就是横着切圆柱，截面和底面一样是圆。",
    "椭圆": "切面斜着穿过圆柱侧面，圆形被斜向拉长，截面就会成为椭圆。",
    "矩形": "切面沿圆柱轴线方向竖着切，并穿过上下底面，展开来看就是两条直边加上下边，常见为矩形。",
    "带弧边截面": "切面只切到圆柱侧面的一部分和底面边界时，侧面贡献弧线，所以会出现带弧边截面。",
    "纯三角形": "只要切到圆柱侧面，就会带曲线；竖切也会有两条平行母线，不会得到纯三角形。",
    "纯五边形": "圆柱侧面是曲面，截面不可能全由五条直边组成。",
    "纯六边形": "圆柱没有六个平面侧面，不能直接切出纯六边形。",
    "只有直边的复杂多边形": "圆柱的曲面会带来曲线；只有直边的复杂多边形通常来自方体或棱柱。",
  },
  cone: {
    "圆": "切面与圆锥底面平行，横着切圆锥，截面就是圆。",
    "椭圆": "切面斜切圆锥侧面且不过顶点，截面会成为椭圆。",
    "过顶点等腰三角形": "切面经过圆锥顶点和底面直径，两条母线成为三角形的两条腰。",
    "非过顶点曲边截面": "切面不过顶点时，圆锥侧面提供曲线，截面会带圆锥曲线特征。",
    "纯正方形": "圆锥没有四个平面侧面，不能直接得到纯正方形。",
    "纯六边形": "圆锥侧面是曲面，单独切它不会出现六条直边围成的纯六边形。",
    "无曲线多边形": "除非过顶点形成母线三角形，否则圆锥截面通常带曲线，不会是无曲线复杂多边形。",
  },
  pyramid: {
    "三角形": "切面经过棱锥三个侧面，或者靠近顶点切过三条棱，就会形成三角形。",
    "四边形": "切面同时碰到四个侧面或底面相关区域，四条交线段围成四边形。",
    "梯形": "切面与底面大致平行但稍有倾斜，或斜穿两组侧面时，容易形成梯形。",
    "五边形": "切面同时穿过棱锥的五个平面部分时，可以得到五边形。",
    "圆": "棱锥所有面都是平面，切面放在哪里都不会直接出现圆。",
    "椭圆": "椭圆来自曲面，棱锥没有曲面，所以不能直接切出椭圆。",
    "曲边图形": "棱锥截面边界来自平面交线，只会是直线段，不会出现曲边。",
  },
};

const SECTION_3D_PRESETS = {
  cube: {
    "等边三角形": { normal: [1, 1, 1], offset: 0.62, shape: "triangle", scale: [1.05, 1.05], limit: 0.45 },
    "直角三角形": { normal: [1, 0, 0.25], offset: 0.68, shape: "rightTriangle", scale: [1.1, 0.95], limit: 0.45 },
    "正方形": { normal: [0, 1, 0], offset: 0, shape: "square", scale: [1.55, 1.55], limit: 0.82 },
    "长方形": { normal: [0.45, 1, 0], offset: 0, shape: "rectangle", scale: [1.75, 0.9], limit: 0.65 },
    "梯形": { normal: [0.3, 1, 0.45], offset: 0.15, shape: "trapezoid", scale: [1.45, 1.05], limit: 0.55 },
    "五边形": { normal: [0.65, 1, 0.35], offset: 0.05, shape: "pentagon", scale: [1.24, 1.05], limit: 0.55 },
    "六边形": { normal: [1, 1, 1], offset: 0, shape: "hexagon", scale: [1.24, 1.08], limit: 0.48 },
    "圆": { normal: [0, 1, 0], offset: 0, shape: "circle", scale: [1.05, 1.05], limit: 0.82, impossible: true },
    "椭圆": { normal: [0.35, 1, 0.15], offset: 0, shape: "ellipse", scale: [1.18, 0.72], limit: 0.65, impossible: true },
    "曲边图形": { normal: [0.3, 1, 0.4], offset: 0, shape: "arc", scale: [1.35, 0.9], limit: 0.58, impossible: true },
    "超过 6 条边": { normal: [1, 1, 1], offset: 0, shape: "many", scale: [1.12, 1.02], limit: 0.5, impossible: true },
  },
  cuboid: {
    "直角三角形": { normal: [1, 0, 0.25], offset: 0.75, shape: "rightTriangle", scale: [1.35, 0.95], limit: 0.52 },
    "矩形": { normal: [1, 0, 0], offset: 0, shape: "rectangle", scale: [1.1, 1.6], limit: 0.9 },
    "平行四边形": { normal: [0.35, 1, 0], offset: 0, shape: "parallelogram", scale: [1.55, 1.05], limit: 0.62 },
    "梯形": { normal: [0.4, 1, 0.35], offset: 0.08, shape: "trapezoid", scale: [1.65, 1.0], limit: 0.58 },
    "五边形": { normal: [0.7, 1, 0.3], offset: 0.02, shape: "pentagon", scale: [1.45, 0.98], limit: 0.55 },
    "六边形": { normal: [1, 1, 1], offset: 0, shape: "hexagon", scale: [1.5, 0.9], limit: 0.45 },
    "圆": { normal: [0, 1, 0], offset: 0, shape: "circle", scale: [1, 1], limit: 0.7, impossible: true },
    "椭圆": { normal: [0.35, 1, 0.15], offset: 0, shape: "ellipse", scale: [1.28, 0.68], limit: 0.58, impossible: true },
    "任意曲边": { normal: [0.3, 1, 0.35], offset: 0, shape: "arc", scale: [1.45, 0.82], limit: 0.58, impossible: true },
    "超过 6 条边": { normal: [1, 1, 1], offset: 0, shape: "many", scale: [1.2, 0.9], limit: 0.45, impossible: true },
  },
  cylinder: {
    "圆": { normal: [0, 1, 0], offset: 0, shape: "circle", scale: [1.25, 1.25], limit: 0.9 },
    "椭圆": { normal: [0.55, 1, 0], offset: 0, shape: "ellipse", scale: [1.65, 1.05], limit: 0.72 },
    "矩形": { normal: [1, 0, 0], offset: 0, shape: "rectangle", scale: [1.35, 1.85], limit: 0.82 },
    "带弧边截面": { normal: [1, 0, 0], offset: 0.42, shape: "arc", scale: [1.1, 1.05], limit: 0.38 },
    "纯三角形": { normal: [0.4, 1, 0.1], offset: 0, shape: "triangle", scale: [1.15, 1.0], limit: 0.55, impossible: true },
    "纯五边形": { normal: [0.3, 1, 0.15], offset: 0, shape: "pentagon", scale: [1.12, 0.95], limit: 0.55, impossible: true },
    "纯六边形": { normal: [0.3, 1, 0.15], offset: 0, shape: "hexagon", scale: [1.12, 0.95], limit: 0.55, impossible: true },
    "只有直边的复杂多边形": { normal: [0.3, 1, 0.15], offset: 0, shape: "many", scale: [1.1, 0.9], limit: 0.55, impossible: true },
  },
  cone: {
    "圆": { normal: [0, 1, 0], offset: -0.25, shape: "circle", scale: [0.82, 0.82], limit: 0.62 },
    "椭圆": { normal: [0.45, 1, 0], offset: -0.18, shape: "ellipse", scale: [1.18, 0.68], limit: 0.45 },
    "过顶点等腰三角形": { normal: [1, 0, 0], offset: 0, shape: "triangle", scale: [1.18, 1.65], limit: 0.2 },
    "非过顶点曲边截面": { normal: [0.52, 1, 0], offset: -0.08, shape: "arc", scale: [1.05, 0.82], limit: 0.45 },
    "纯正方形": { normal: [0.5, 1, 0], offset: -0.08, shape: "square", scale: [0.9, 0.9], limit: 0.45, impossible: true },
    "纯六边形": { normal: [0.5, 1, 0], offset: -0.08, shape: "hexagon", scale: [0.95, 0.85], limit: 0.45, impossible: true },
    "无曲线多边形": { normal: [0.5, 1, 0], offset: -0.08, shape: "many", scale: [0.98, 0.82], limit: 0.45, impossible: true },
  },
  pyramid: {
    "三角形": { normal: [1, 0, 0], offset: 0, shape: "triangle", scale: [1.15, 1.5], limit: 0.35 },
    "四边形": { normal: [0.4, 1, 0.25], offset: -0.15, shape: "quad", scale: [1.2, 0.9], limit: 0.45 },
    "梯形": { normal: [0.35, 1, 0], offset: -0.18, shape: "trapezoid", scale: [1.2, 0.88], limit: 0.45 },
    "五边形": { normal: [0.55, 1, 0.25], offset: -0.1, shape: "pentagon", scale: [1.05, 0.86], limit: 0.4 },
    "圆": { normal: [0, 1, 0], offset: -0.2, shape: "circle", scale: [0.95, 0.95], limit: 0.45, impossible: true },
    "椭圆": { normal: [0.35, 1, 0.15], offset: -0.15, shape: "ellipse", scale: [1.18, 0.72], limit: 0.45, impossible: true },
    "曲边图形": { normal: [0.35, 1, 0.15], offset: -0.15, shape: "arc", scale: [1.18, 0.75], limit: 0.45, impossible: true },
  },
};

function drawingForSection(solidId, label) {
  const solidDrawing = SOLID_SECTION_DRAWING[solidId]?.[label];
  if (solidDrawing) return DRAWINGS[solidDrawing];
  return DRAWINGS[SECTION_DRAWING_BY_LABEL[label] ?? "rectangle"];
}

function makeShapeGeometry(type, sx = 1, sy = 1) {
  if (type === "circle") {
    const geometry = new THREE.CircleGeometry(0.5, 72);
    geometry.scale(sx, sy, 1);
    return geometry;
  }

  const shape = new THREE.Shape();
  if (type === "ellipse") {
    const geometry = new THREE.CircleGeometry(0.5, 96);
    geometry.scale(sx, sy * 0.58, 1);
    return geometry;
  }

  const points = shapePoints(type);
  points.forEach(([x, y], index) => {
    const px = x * sx;
    const py = y * sy;
    if (index === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  });
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function makeSolidGeometry(solidId) {
  if (solidId === "cuboid") return new THREE.BoxGeometry(2.2, 1.35, 1.35);
  if (solidId === "cylinder") return new THREE.CylinderGeometry(0.9, 0.9, 1.9, 80, 1);
  if (solidId === "cone") return new THREE.ConeGeometry(1, 2, 80, 1);
  if (solidId === "pyramid") {
    const geometry = new THREE.ConeGeometry(1.05, 2, 4, 1);
    geometry.rotateY(Math.PI / 4);
    return geometry;
  }
  return new THREE.BoxGeometry(1.7, 1.7, 1.7);
}

const viewer = {
  renderer: null,
  scene: null,
  camera: null,
  root: null,
  plane: null,
  section: null,
  normal: new THREE.Vector3(0, 1, 0),
  baseOffset: 0,
  limit: 0.6,
  preset: null,
  dragging: false,
  lastY: 0,
};

function shapePoints(type) {
  if (type === "circle" || type === "ellipse") {
    return Array.from({ length: 72 }, (_, index) => {
      const angle = (index / 72) * Math.PI * 2;
      return [Math.cos(angle) * 0.5, Math.sin(angle) * 0.5];
    });
  }
  const pointsByType = {
    triangle: [[0, 0.58], [-0.58, -0.42], [0.58, -0.42]],
    rightTriangle: [[-0.48, 0.52], [-0.48, -0.48], [0.58, -0.48]],
    square: [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]],
    rectangle: [[-0.72, 0.42], [0.72, 0.42], [0.72, -0.42], [-0.72, -0.42]],
    trapezoid: [[-0.42, 0.48], [0.42, 0.48], [0.65, -0.46], [-0.65, -0.46]],
    parallelogram: [[-0.48, 0.42], [0.68, 0.42], [0.45, -0.42], [-0.7, -0.42]],
    pentagon: [[0, 0.55], [0.52, 0.16], [0.34, -0.48], [-0.34, -0.48], [-0.52, 0.16]],
    hexagon: [[-0.58, 0], [-0.34, 0.48], [0.34, 0.48], [0.58, 0], [0.34, -0.48], [-0.34, -0.48]],
    many: [[0, 0.58], [0.35, 0.48], [0.58, 0.18], [0.55, -0.2], [0.28, -0.5], [-0.12, -0.56], [-0.48, -0.34], [-0.58, 0.08], [-0.34, 0.45]],
    quad: [[-0.52, 0.3], [0.14, 0.55], [0.6, -0.12], [-0.24, -0.5]],
    arc: [[-0.58, -0.38], [-0.42, 0.36], [0, 0.52], [0.42, 0.36], [0.58, -0.38]],
  };
  return pointsByType[type] ?? pointsByType.rectangle;
}

function initViewer() {
  if (!elements.canvas || viewer.renderer) return;
  viewer.renderer = new THREE.WebGLRenderer({
    canvas: elements.canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  viewer.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  elements.canvas.dataset.engine = `three.js r${THREE.REVISION}`;
  viewer.scene = new THREE.Scene();
  viewer.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  viewer.camera.position.set(4.1, 3.1, 4.7);
  viewer.camera.lookAt(0, 0, 0);

  const ambient = new THREE.HemisphereLight(0xffffff, 0xb9c7c1, 2.4);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 4, 5);
  viewer.scene.add(ambient, key);

  const grid = new THREE.GridHelper(4.2, 12, 0xcfd8d4, 0xe9efec);
  grid.position.y = -1.08;
  viewer.scene.add(grid);

  viewer.root = new THREE.Group();
  viewer.scene.add(viewer.root);

  elements.canvas.addEventListener("pointerdown", beginDrag);
  elements.canvas.addEventListener("pointermove", moveDrag);
  elements.canvas.addEventListener("pointerup", endDrag);
  elements.canvas.addEventListener("pointercancel", endDrag);
  elements.canvas.addEventListener("wheel", onWheel, { passive: false });
  elements.resetSection?.addEventListener("click", resetSectionOffset);
  window.addEventListener("resize", resizeViewer);
  resizeViewer();
}

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
    else child.material?.dispose?.();
  });
}

function clearRoot() {
  while (viewer.root.children.length) {
    const child = viewer.root.children.pop();
    disposeObject(child);
  }
}

function liveScaleFactor() {
  if (!viewer.preset) return 1;
  const travel = Math.abs(state.sectionOffset) / Math.max(viewer.limit, 0.01);
  return Math.max(0.38, 1 - travel * 0.48);
}

function renderLiveSection() {
  if (!elements.liveSectionSvg || !viewer.preset) return;
  const preset = viewer.preset;
  const scale = liveScaleFactor();
  const sx = (preset.scale?.[0] ?? 1) * scale;
  const sy = (preset.scale?.[1] ?? 1) * scale * (preset.shape === "ellipse" ? 0.58 : 1);
  const points = shapePoints(preset.shape).map(([x, y]) => [110 + x * sx * 112, 90 - y * sy * 112]);
  const path = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") + " Z";
  const isCannot = state.selectedVerdict === "cannot";

  elements.liveSectionCard.dataset.verdict = state.selectedVerdict;
  elements.liveSectionVerdict.textContent = isCannot ? "不能直接截出" : "能截出";
  elements.liveSectionCaption.textContent = isCannot
    ? `${SHAPES[state.solidId].name}没有这种真实截面，图中是错误尝试。`
    : `${SHAPES[state.solidId].name}当前截面：${state.selectedLabel}`;
  elements.liveSectionSvg.innerHTML = `
    <path class="live-fill" d="${path}"></path>
    ${isCannot ? '<line class="live-nope" x1="58" y1="142" x2="162" y2="38"></line>' : ""}
  `;
  elements.liveSectionSvg.dataset.shape = preset.shape;
  elements.liveSectionSvg.dataset.scale = scale.toFixed(3);
  elements.liveSectionSvg.dataset.label = state.selectedLabel;
  elements.liveSectionSvg.dataset.verdict = state.selectedVerdict;
}

function resizeViewer() {
  if (!viewer.renderer || !elements.canvas) return;
  const rect = elements.canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  viewer.camera.aspect = width / height;
  viewer.camera.updateProjectionMatrix();
  viewer.renderer.setSize(width, height, false);
  renderViewer();
}

function buildViewerScene() {
  initViewer();
  if (!viewer.root) return;
  clearRoot();

  const shape = SHAPES[state.solidId];
  const preset = SECTION_3D_PRESETS[state.solidId]?.[state.selectedLabel] ?? SECTION_3D_PRESETS[state.solidId]?.[shape.can[0]];
  const solidGeometry = makeSolidGeometry(state.solidId);
  const solidMaterial = new THREE.MeshStandardMaterial({
    color: 0xdff3ee,
    transparent: true,
    opacity: 0.48,
    roughness: 0.72,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const solid = new THREE.Mesh(solidGeometry, solidMaterial);
  viewer.root.add(solid);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(solidGeometry),
    new THREE.LineBasicMaterial({ color: 0x22332f, linewidth: 1 })
  );
  viewer.root.add(edges);

  viewer.normal = new THREE.Vector3(...preset.normal).normalize();
  viewer.baseOffset = preset.offset ?? 0;
  viewer.limit = preset.limit ?? 0.6;
  viewer.preset = preset;
  state.sectionOffset = 0;

  const planeGeometry = new THREE.PlaneGeometry(2.85, 2.05);
  const planeMaterial = new THREE.MeshBasicMaterial({
    color: preset.impossible ? 0xc95a51 : 0x346fd0,
    transparent: true,
    opacity: preset.impossible ? 0.15 : 0.17,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  viewer.plane = new THREE.Mesh(planeGeometry, planeMaterial);
  viewer.root.add(viewer.plane);

  const sectionGeometry = makeShapeGeometry(preset.shape, preset.scale?.[0] ?? 1, preset.scale?.[1] ?? 1);
  const sectionMaterial = new THREE.MeshBasicMaterial({
    color: preset.impossible ? 0xb64a42 : 0xd85418,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  viewer.section = new THREE.Mesh(sectionGeometry, sectionMaterial);
  viewer.root.add(viewer.section);

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(sectionGeometry),
    new THREE.LineBasicMaterial({ color: preset.impossible ? 0x8f332e : 0x9a3a10 })
  );
  viewer.section.add(outline);

  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), viewer.normal);
  viewer.plane.quaternion.copy(quaternion);
  viewer.section.quaternion.copy(quaternion);
  applySectionOffset();
  elements.canvas.dataset.solid = state.solidId;
  elements.canvas.dataset.sectionLabel = state.selectedLabel;
  elements.canvas.dataset.sectionVerdict = state.selectedVerdict;
  renderLiveSection();
}

function applySectionOffset() {
  const total = viewer.baseOffset + state.sectionOffset;
  const position = viewer.normal.clone().multiplyScalar(total);
  viewer.plane?.position.copy(position);
  viewer.section?.position.copy(position.clone().add(viewer.normal.clone().multiplyScalar(0.006)));
  if (elements.dragStatus) {
    const mm = Math.round(state.sectionOffset * 100);
    elements.dragStatus.textContent = mm === 0 ? "上下拖动切面" : `偏移 ${mm > 0 ? "+" : ""}${mm}`;
  }
  if (elements.canvas) elements.canvas.dataset.sectionOffset = state.sectionOffset.toFixed(3);
  renderLiveSection();
  renderViewer();
}

function updateSectionOffset(delta) {
  state.sectionOffset = Math.max(-viewer.limit, Math.min(viewer.limit, state.sectionOffset + delta));
  applySectionOffset();
}

function resetSectionOffset() {
  state.sectionOffset = 0;
  applySectionOffset();
}

function beginDrag(event) {
  viewer.dragging = true;
  viewer.lastY = event.clientY;
  elements.canvas.setPointerCapture?.(event.pointerId);
}

function moveDrag(event) {
  if (!viewer.dragging) return;
  const dy = viewer.lastY - event.clientY;
  viewer.lastY = event.clientY;
  updateSectionOffset(dy * 0.007);
}

function endDrag(event) {
  viewer.dragging = false;
  if (elements.canvas.hasPointerCapture?.(event.pointerId)) {
    elements.canvas.releasePointerCapture(event.pointerId);
  }
}

function onWheel(event) {
  event.preventDefault();
  updateSectionOffset(-event.deltaY * 0.0018);
}

function renderViewer() {
  if (!viewer.renderer) return;
  viewer.root.rotation.y = -0.34;
  viewer.root.rotation.x = 0.08;
  viewer.renderer.render(viewer.scene, viewer.camera);
}

function sectionTileList(items, verdict, solidId) {
  return `<div class="section-tile-list">${items.map((item) => {
    const drawing = drawingForSection(solidId, item);
    return `
      <button class="section-tile ${item === state.selectedLabel && verdict === state.selectedVerdict ? "is-selected" : ""}" type="button" data-section-label="${item}" data-section-verdict="${verdict}" data-verdict="${verdict}" aria-pressed="${item === state.selectedLabel && verdict === state.selectedVerdict}">
        <span class="section-thumb">${drawing}</span>
        <strong>${item}</strong>
      </button>`;
  }).join("")}</div>`;
}

function renderSolidList() {
  elements.solidList.innerHTML = Object.entries(SHAPES).map(([id, shape]) => `
    <button class="solid-card ${id === state.solidId ? "is-selected" : ""}" type="button" data-solid-id="${id}" aria-pressed="${id === state.solidId}">
      <span class="solid-icon">${DRAWINGS[shape.icon]}</span>
      <span>
        <strong>${shape.name}</strong>
        <span>${shape.summary}</span>
      </span>
    </button>
  `).join("");
}

function renderKnowledge(shape) {
  elements.solidTag.textContent = shape.name;
  elements.knowledgeGrid.innerHTML = `
    <article class="knowledge-card can">
      <h3>常见能截出</h3>
      ${sectionTileList(shape.can, "can", state.solidId)}
    </article>
    <article class="knowledge-card cannot">
      <h3>不能直接截出</h3>
      ${sectionTileList(shape.cannot, "cannot", state.solidId)}
    </article>
  `;
  elements.solidRule.textContent = shape.rule;
}

function renderDemoButtons(shape) {
  elements.demoButtons.innerHTML = shape.demos.map((demo) => `
    <button class="demo-button ${demo.id === state.demoId ? "is-selected" : ""}" type="button" data-demo-id="${demo.id}" data-verdict="${demo.verdict}" aria-pressed="${demo.id === state.demoId}">
      <span>
        <strong>${demo.title}</strong>
        <small>${demo.note}</small>
      </span>
      <span>${demo.label}</span>
    </button>
  `).join("");
}

function renderDemo(shape) {
  const demo = shape.demos.find((item) => item.id === state.demoId) ?? shape.demos[0];
  state.demoId = demo.id;
  const selectedLabel = state.selectedLabel;
  const selectedVerdict = state.selectedVerdict;
  elements.demoVerdict.textContent = selectedVerdict === "cannot" ? "不可行" : "可行";
  elements.demoVerdict.dataset.verdict = selectedVerdict;
  elements.demoLabel.textContent = shape.name;
  elements.demoTitle.textContent = selectedVerdict === "cannot"
    ? `${shape.name}不能直接截出${selectedLabel}`
    : `${shape.name}怎样截出${selectedLabel}`;
  elements.demoCopy.textContent = POSITION_RULES[state.solidId]?.[selectedLabel]
    ?? "右侧 3D 视口已经切到这个基础截面。你可以上下拖动切面，观察截面在立体内部前后移动。";
  buildViewerScene();
}

function render() {
  const shape = SHAPES[state.solidId];
  renderSolidList();
  renderKnowledge(shape);
  renderDemoButtons(shape);
  renderDemo(shape);
}

elements.solidList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-solid-id]");
  if (!button) return;
  const shape = SHAPES[button.dataset.solidId];
  if (!shape) return;
  state.solidId = button.dataset.solidId;
  state.demoId = shape.demos[0].id;
  state.selectedLabel = DEMO_FOCUS_LABEL[state.demoId] ?? shape.can[0];
  state.selectedVerdict = shape.demos[0].verdict;
  render();
});

elements.demoButtons.addEventListener("click", (event) => {
  const button = event.target.closest("[data-demo-id]");
  if (!button) return;
  state.demoId = button.dataset.demoId;
  const shape = SHAPES[state.solidId];
  const demo = shape.demos.find((item) => item.id === state.demoId) ?? shape.demos[0];
  state.selectedLabel = DEMO_FOCUS_LABEL[state.demoId] ?? shape.can[0];
  state.selectedVerdict = demo.verdict;
  render();
});

elements.knowledgeGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-section-label]");
  if (!button) return;
  const shape = SHAPES[state.solidId];
  state.selectedLabel = button.dataset.sectionLabel;
  state.selectedVerdict = button.dataset.sectionVerdict;
  const demo = shape.demos.find((item) => DEMO_FOCUS_LABEL[item.id] === state.selectedLabel)
    ?? shape.demos.find((item) => item.verdict === state.selectedVerdict)
    ?? shape.demos[0];
  state.demoId = demo.id;
  render();
});

render();

window.__sectionFoundation = {
  getState: () => ({ ...state }),
  shapes: SHAPES,
  viewer,
};
