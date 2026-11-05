// 类名与结构审计：防止"改了 HTML/JS 忘了改 CSS（或反之）"的静默塌陷。
// 用法：node tools/audit.mjs
// 退出码：0 全部通过，1 有失败项。每次改动类名、样式或结构后跑一遍。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  cond ? pass++ : fail++;
  console.log((cond ? "PASS " : "FAIL ") + label + (cond || extra == null ? "" : " :: " + extra));
};

const html = read("index.html");
const css = read("styles.css");
const js = read("app.js");

// ---- 文件与引用 ----
check("HTML 引用 styles.css", /<link[^>]+href="styles\.css"/.test(html));
check("HTML 引用 app.js 且带 defer", /<script[^>]+src="app\.js"[^>]*defer/.test(html));
check("HTML 无内联 <style>", !/<style[\s>]/.test(html));
check("HTML 无内联 <script>（仅允许外部引用）", !/<script(?![^>]*\bsrc=)[^>]*>/.test(html));

// ---- CSP ----
const csp = (html.match(/Content-Security-Policy"[^>]*content="([^"]*)"/) || [])[1] || "";
check("存在 CSP meta", csp.length > 0);
check("CSP 允许同源资源", csp.includes("default-src 'self'"));
check("CSP 未放行 unsafe-inline / unsafe-eval", !/unsafe-(inline|eval)/.test(csp));
check("HTML 无内联事件属性（CSP 下会被拦截）", !/\son[a-z]+\s*=\s*["']/.test(html));

// ---- 零外部依赖 ----
const external = [html, css, js].map((s) => s.match(/https?:\/\/[^"'\s)]+/g) || []).flat();
check("无任何外部 URL 引用", external.length === 0, external.join(", ") || "none");
check("CSS 无 @import / url() 外链", !/@import|url\(\s*['"]?https?:/.test(css));

// ---- CSS 结构 ----
check("CSS 大括号配对", (css.match(/{/g) || []).length === (css.match(/}/g) || []).length);

const defined = new Set();
for (const sel of css.match(/[^{}]+\{/g) || []) {
  for (const m of sel.matchAll(/(?<!:)\.([a-zA-Z][\w-]*)/g)) defined.add(m[1]);
}

// ---- 类名：使用处必须都有定义，定义处必须都有使用 ----
const used = new Set();
for (const m of html.matchAll(/class="([^"]*)"/g)) {
  for (const t of m[1].trim().split(/\s+/)) if (t) used.add(t);
}
for (const m of js.matchAll(/className\s*=\s*"([^"]*)"/g)) {
  for (const t of m[1].trim().split(/\s+/)) if (t) used.add(t);
}
// 三元表达式里出现的 " is-over" 这类片段
for (const m of js.matchAll(/\bis-[\w-]+/g)) used.add(m[0]);
// setStatus 动态拼出 " is-" + kind，无法从字面量取到，手动列出
for (const t of ["is-ok", "is-error"]) used.add(t);

const missing = [...used].filter((c) => !defined.has(c));
const unused = [...defined].filter((c) => !used.has(c));
check("所有使用的类都有样式定义", missing.length === 0, missing.join(", ") || "none");
check("没有未使用的样式类", unused.length === 0, unused.join(", ") || "none");

// ---- id：JS 引用的元素必须存在 ----
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
for (const m of js.matchAll(/getElementById\("([^"]+)"\)/g)) {
  check("元素存在 #" + m[1], htmlIds.has(m[1]));
}

// ---- 行为约束 ----
check("app.js 不使用 innerHTML（防用户输入拼进 HTML）", !/innerHTML/.test(js));
check("app.js 不依赖已废弃的 execCommand", !/execCommand\s*\(/.test(js));
check("宽度上限常量为 6", /const MAX_WIDTH = 6;/.test(js));
check("显示宽度与字位占用两套度量并存", /function charWidth/.test(js) && /function slotWidth/.test(js));
check("预览区不渲染占位文案", !html.includes("请先生成名称") && !js.includes('"无法生成"'));

// ---- 关键视觉属性 ----
const must = [
  ["卡片圆角", /\.card\s*\{[^}]*border-radius/],
  ["卡片阴影", /\.card\s*\{[^}]*box-shadow/],
  ["卡片居中", /\.card\s*\{[^}]*margin:\s*0 auto/],
  ["输入框全宽", /\.input\s*\{[^}]*width:\s*100%/],
  ["清空按钮绝对定位", /\.btn-clear\s*\{[^}]*position:\s*absolute/],
  ["结果区最小高度", /\.result\s*\{[^}]*min-height/],
  ["结果区自动换行", /\.result\s*\{[^}]*flex-wrap:\s*wrap/],
  ["结果过期样式", /\.result\.is-stale\s*\{[^}]*opacity/],
  ["大字字形", /\.char-glyph\s*\{[^}]*font-size:\s*1\.5rem/],
  ["码位小字", /\.char-code\s*\{[^}]*font-size:\s*0\.75rem/],
  ["错误态颜色", /\.status\.is-error\s*\{[^}]*color/],
  ["成功态颜色", /\.status\.is-ok\s*\{[^}]*color/],
];
for (const [label, re] of must) check(label, re.test(css));

// 输入框字号不小于 16px，避免 iOS 聚焦缩放
const inputFont = (css.match(/\.input\s*\{[^}]*font-size:\s*([\d.]+)rem/) || [])[1];
check("输入框字号 >= 16px", !!inputFont && parseFloat(inputFont) >= 1, inputFont && inputFont + "rem");

console.log("\npass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
