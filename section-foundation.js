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
    "等边三角形": "把蓝色刀片放在一个顶角上，只削掉这个角。它只碰到这个角旁边的 3 个面，所以留下 3 条边；三边削得差不多时，就像等边三角形。",
    "直角三角形": "还是削一个角，但让刀片更贴近两条互相垂直的边。这样留下来的三角形会带一个直角，所以能看到直角三角形。",
    "正方形": "把刀片摆平，和正方体的某个外面平行，从中间横着切过去。切出来和外面的方脸一样，就是正方形。",
    "长方形": "把刀片竖起来斜着穿过去，让它沿着一组边走。截面会被拉长，所以看到的是长方形。",
    "梯形": "把刀片斜着切，但不要左右切得一样深。一边切得长、一边切得短，截面就会像梯形。",
    "五边形": "让刀片碰到 5 个面，再故意躲开剩下的 1 个面。它碰到几个面，就会留下几条边，所以这里会出现五边形。",
    "六边形": "把刀片斜着放，不是只削一个角，而是从上面三个面穿进去、从下面三个面穿出来。它一共碰到 6 个面，所以边界有 6 条边，看起来就是六边形。",
    "圆": "正方体全是平面，没有圆滚滚的曲面。刀片不管怎么摆，碰到的边都是直的，所以不能直接切出圆。",
    "椭圆": "椭圆要靠圆柱、圆锥那种弯曲的面。正方体没有曲面，刀片再斜也只会切出直边图形。",
    "曲边图形": "曲边要从弯的表面来。正方体每一面都是平的，所以截面边界不会自己弯起来。",
    "超过 6 条边": "正方体只有 6 个面。刀片最多碰到 6 个面，所以最多留下 6 条边，不会直接超过 6 条。",
  },
  cuboid: {
    "直角三角形": "把刀片放到长方体的一个角上，只削掉这个角。它碰到角旁边的 3 个面，就会留下三角形；贴近直角边时，会更像直角三角形。",
    "矩形": "把刀片摆得和某个外面平行，或者竖着沿长方体切进去。切出来的上下左右都是直边，常见就是矩形。",
    "平行四边形": "让刀片斜着穿过长方体，但方向一直跟一组边保持一致。两组边还是互相平行，所以会看到平行四边形。",
    "梯形": "让刀片斜切进去，一头切得宽，一头切得窄。上下两条边长短不一样，就会像梯形。",
    "五边形": "刀片碰到 5 个面、躲开 1 个面时，就会留下 5 条边，所以可以得到五边形。",
    "六边形": "让刀片斜着同时碰到长方体的 6 个面，就能得到六边形。只是长方体被拉长了，六边形也常常会被拉长。",
    "圆": "长方体也全是平面，没有圆的曲面来源，所以刀片放哪里都切不出圆。",
    "椭圆": "椭圆要靠弯曲表面。长方体只有平面，切出来只能是直边图形。",
    "任意曲边": "长方体没有弯面，刀片切到的边只会是直线，不会突然变成曲边。",
    "超过 6 条边": "长方体也只有 6 个面。刀片最多碰到 6 个面，所以单次截面不会超过 6 条边。",
  },
  cylinder: {
    "圆": "把刀片横着放，像切火腿片一样切圆柱。刀片和底面平行，所以切出来还是圆。",
    "椭圆": "把刀片斜着切圆柱，原来的圆会被斜着拉长。你看到的就不是正圆，而是椭圆。",
    "矩形": "把刀片竖着穿过圆柱，从上底切到下底。两侧是直直的母线，上下也是直边，所以常见是矩形。",
    "带弧边截面": "如果刀片只擦到圆柱侧面的一部分，侧面本来就是弯的，截面边上就会带弧线。",
    "纯三角形": "圆柱只要切到侧面，就会带弯边；竖切也会有两条平行直边，所以不能得到纯三角形。",
    "纯五边形": "五边形要求边界全是直边。圆柱侧面是弯的，所以不能直接切出纯五边形。",
    "纯六边形": "六边形需要 6 条直边围起来。圆柱没有 6 个平面侧面，所以不能直接切出纯六边形。",
    "只有直边的复杂多边形": "只要题里是圆柱，先盯着曲面：斜切通常会带曲线。全是直边的复杂多边形，一般不是圆柱单独切出来的。",
  },
  cone: {
    "圆": "把刀片横着放，和圆锥底面平行。这样切出来的每一圈都像缩小版底面，所以是圆。",
    "椭圆": "把刀片斜着切圆锥，但不要经过尖尖的顶点。侧面的圆被斜着拉长，就会看到椭圆。",
    "过顶点等腰三角形": "让刀片穿过圆锥的尖顶，再切到底面。左右两条斜边就是圆锥的两条母线，所以会成等腰三角形。",
    "非过顶点曲边截面": "刀片不过尖顶时，它切到的是圆锥弯曲的侧面，边界就容易带曲线。",
    "纯正方形": "圆锥没有四个平面侧面，刀片找不到四条直边来围成正方形。",
    "纯六边形": "圆锥侧面是弯的，不是 6 个平面拼成的，所以单独切不出纯六边形。",
    "无曲线多边形": "圆锥除了过顶点能出三角形，更多时候会带曲线。全直边复杂多边形不是它的常规截面。",
  },
  pyramid: {
    "三角形": "把刀片靠近棱锥的尖顶，让它碰到 3 个侧面。三个面各留一条边，合起来就是三角形。",
    "四边形": "让刀片往下切深一点，碰到 4 个面或碰到底面。它留下 4 条边，就会成为四边形。",
    "梯形": "刀片大致横着切，但稍微歪一点。上边短、下边长时，看起来就像梯形。",
    "五边形": "刀片切得更深，碰到棱锥的 5 个平面部分，就可以得到五边形。",
    "圆": "棱锥每一面都是平的，没有圆弧来源，所以刀片放哪里都不能直接切出圆。",
    "椭圆": "椭圆要靠弯曲表面。棱锥没有曲面，所以不能直接切出椭圆。",
    "曲边图形": "棱锥的每条截边都来自平面相交，只会是直线，不会出现曲边。",
  },
};

const SECTION_3D_PRESETS = {
  cube: {
    "等边三角形": { normal: [1, 1, 1], offset: 0.62, shape: "triangle", scale: [1.05, 1.05], limit: 0.45 },
    "直角三角形": { normal: [0.02, 0.017, 1], offset: 0.8528, shape: "rightTriangle", scale: [1.1, 0.95], limit: 0.055 },
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
    "直角三角形": { normal: [0.02, 0.017, 1], offset: 0.682, shape: "rightTriangle", scale: [1.35, 0.95], limit: 0.055 },
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

function geometryTriangles(geometry) {
  const position = geometry.attributes.position;
  const index = geometry.index;
  const readVertex = (vertexIndex) => new THREE.Vector3(
    position.getX(vertexIndex),
    position.getY(vertexIndex),
    position.getZ(vertexIndex)
  );
  const triangles = [];

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      triangles.push([
        readVertex(index.getX(i)),
        readVertex(index.getX(i + 1)),
        readVertex(index.getX(i + 2)),
      ]);
    }
    return triangles;
  }

  for (let i = 0; i < position.count; i += 3) {
    triangles.push([readVertex(i), readVertex(i + 1), readVertex(i + 2)]);
  }
  return triangles;
}

function pushUniquePoint(points, point, tolerance = 0.0005) {
  if (points.some((candidate) => candidate.distanceToSquared(point) < tolerance * tolerance)) return;
  points.push(point.clone());
}

function planeBasis(normal) {
  const helper = Math.abs(normal.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const u = helper.clone().cross(normal).normalize();
  const v = normal.clone().cross(u).normalize();
  return { u, v };
}

function orderSectionPoints(points, normal) {
  if (points.length < 3) return points;
  const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length);
  const { u, v } = planeBasis(normal);
  const ordered = [...points].sort((a, b) => {
    const da = a.clone().sub(center);
    const db = b.clone().sub(center);
    return Math.atan2(da.dot(v), da.dot(u)) - Math.atan2(db.dot(v), db.dot(u));
  });
  return removeCollinearSectionPoints(ordered);
}

function removeCollinearSectionPoints(points) {
  if (points.length <= 3) return points;
  const cleaned = [];
  points.forEach((point, index) => {
    const prev = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const a = point.clone().sub(prev);
    const b = next.clone().sub(point);
    const crossLength = a.clone().cross(b).length();
    const scale = Math.max(a.length() * b.length(), 0.000001);
    if (crossLength / scale > 0.01) cleaned.push(point);
  });
  return cleaned.length >= 3 ? cleaned : points;
}

function collectPlaneSectionPoints(geometry, normal, offset) {
  const points = [];
  const epsilon = 0.00001;
  const addEdgeIntersection = (a, b) => {
    const da = normal.dot(a) - offset;
    const db = normal.dot(b) - offset;

    if (Math.abs(da) <= epsilon) pushUniquePoint(points, a);
    if (Math.abs(db) <= epsilon) pushUniquePoint(points, b);
    if (da * db >= 0) return;

    const t = da / (da - db);
    pushUniquePoint(points, a.clone().lerp(b, t));
  };

  geometryTriangles(geometry).forEach(([a, b, c]) => {
    addEdgeIntersection(a, b);
    addEdgeIntersection(b, c);
    addEdgeIntersection(c, a);
  });

  return orderSectionPoints(points, normal);
}

function makeSectionGeometryFromPoints(points, normal, inset = 0.004) {
  const geometry = new THREE.BufferGeometry();
  if (points.length < 3) {
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
    return geometry;
  }

  const vertices = [];
  points.forEach((point) => {
    const lifted = point.clone().addScaledVector(normal, inset);
    vertices.push(lifted.x, lifted.y, lifted.z);
  });

  const indices = [];
  for (let i = 1; i < points.length - 1; i += 1) indices.push(0, i, i + 1);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeSectionOutlineGeometry(points, normal, inset = 0.009) {
  const geometry = new THREE.BufferGeometry();
  if (points.length < 2) {
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
    return geometry;
  }

  const vertices = [];
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const a = point.clone().addScaledVector(normal, inset);
    const b = next.clone().addScaledVector(normal, inset);
    vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);
  });
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  return geometry;
}

const viewer = {
  renderer: null,
  scene: null,
  camera: null,
  root: null,
  plane: null,
  section: null,
  sectionOutline: null,
  solidGeometry: null,
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
  viewer.solidGeometry = solidGeometry;
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

  const sectionGeometry = new THREE.BufferGeometry();
  const sectionMaterial = new THREE.MeshBasicMaterial({
    color: preset.impossible ? 0xb64a42 : 0xd85418,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  viewer.section = new THREE.Mesh(sectionGeometry, sectionMaterial);
  viewer.root.add(viewer.section);

  viewer.sectionOutline = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: preset.impossible ? 0x8f332e : 0x9a3a10 })
  );
  viewer.root.add(viewer.sectionOutline);

  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), viewer.normal);
  viewer.plane.quaternion.copy(quaternion);
  applySectionOffset();
  elements.canvas.dataset.solid = state.solidId;
  elements.canvas.dataset.sectionLabel = state.selectedLabel;
  elements.canvas.dataset.sectionVerdict = state.selectedVerdict;
  renderLiveSection();
}

function updateRealSectionGeometry(totalOffset) {
  if (!viewer.solidGeometry || !viewer.section || !viewer.sectionOutline) return;

  const points = collectPlaneSectionPoints(viewer.solidGeometry, viewer.normal, totalOffset);
  const sectionGeometry = makeSectionGeometryFromPoints(points, viewer.normal);
  const outlineGeometry = makeSectionOutlineGeometry(points, viewer.normal);

  viewer.section.geometry?.dispose?.();
  viewer.section.geometry = sectionGeometry;
  viewer.sectionOutline.geometry?.dispose?.();
  viewer.sectionOutline.geometry = outlineGeometry;
  viewer.section.visible = points.length >= 3;
  viewer.sectionOutline.visible = points.length >= 3;

  if (elements.canvas) {
    elements.canvas.dataset.sectionVertexCount = String(points.length);
    elements.canvas.dataset.realSection = "true";
  }
}

function applySectionOffset() {
  const total = viewer.baseOffset + state.sectionOffset;
  const position = viewer.normal.clone().multiplyScalar(total);
  viewer.plane?.position.copy(position);
  updateRealSectionGeometry(total);
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

function renderDemo(shape) {
  const demo = shape.demos.find((item) => item.id === state.demoId) ?? shape.demos[0];
  state.demoId = demo.id;
  const selectedLabel = state.selectedLabel;
  const selectedVerdict = state.selectedVerdict;
  elements.demoVerdict.textContent = selectedVerdict === "cannot" ? "不可行" : "可行";
  elements.demoVerdict.dataset.verdict = selectedVerdict;
  elements.demoLabel.textContent = selectedVerdict === "cannot" ? "先看为什么不行" : "先看蓝色刀片";
  elements.demoTitle.textContent = selectedVerdict === "cannot"
    ? `${shape.name}为什么切不出${selectedLabel}`
    : `${shape.name}切${selectedLabel}，要这样摆`;
  elements.demoCopy.textContent = POSITION_RULES[state.solidId]?.[selectedLabel]
    ?? "看蓝色刀片的位置：它碰到哪些面，橙色截面就会留下哪些边。上下拖动可以让它在模型里扫一遍。";
  buildViewerScene();
}

function render() {
  const shape = SHAPES[state.solidId];
  renderSolidList();
  renderKnowledge(shape);
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
