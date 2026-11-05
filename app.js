const MAX_WIDTH = 6;

const invisibleChars = [
  "\u2060","\u2061","\u2062","\u2063","\u2064",
  "\u2066","\u2067","\u2068","\u2069",
  "\uFE00","\uFE01","\uFE02","\uFE03","\uFE04","\uFE05","\uFE06","\uFE07","\uFE08","\uFE09","\uFE0A","\uFE0B","\uFE0C","\uFE0D","\uFE0E"
];
const invisibleSet = new Set(invisibleChars);

// 生成结果的唯一事实来源，复制与渲染都读它，不再从 DOM 反查
let output = "";
let statusTimer = null;
let stale = false; // 输入已改变、结果不再对应当前名称
let composing = false; // 输入法组合标志，仅用于禁止改写 value

function isInvisible(ch) {
  return invisibleSet.has(ch);
}

function getRandomChar() {
  return invisibleChars[Math.floor(Math.random() * invisibleChars.length)];
}

// 唯一的宽度口径：隐形字符占 0，中文/全角/CJK 标点占 1，其余半角占 0.5
function charWidth(ch) {
  if (isInvisible(ch)) return 0;
  const code = ch.codePointAt(0);
  if ((code >= 0x4e00 && code <= 0x9fff) ||   // 中文
      (code >= 0xff00 && code <= 0xffef) ||   // 全角符号
      (code >= 0x3000 && code <= 0x303f)) {   // CJK 标点
    return 1;
  }
  return 0.5;
}

// 按码点遍历，emoji 等增补平面字符只算一次
function measure(str) {
  let width = 0;
  for (const ch of str) width += charWidth(ch);
  return width;
}

// 字位占用：隐形字符也占 1 个字位。计数与配额用它，裁剪用上面的显示宽度
function slotWidth(ch) {
  return isInvisible(ch) ? 1 : charWidth(ch);
}

function measureSlots(str) {
  let slots = 0;
  for (const ch of str) slots += slotWidth(ch);
  return slots;
}

function truncateToWidth(str, max) {
  let width = 0;
  let kept = "";
  for (const ch of str) {
    const w = charWidth(ch);
    if (width + w > max) break;
    width += w;
    kept += ch;
  }
  return kept;
}

function formatWidth(width) {
  return Number.isInteger(width) ? String(width) : width.toFixed(1);
}

function onNameInput(event) {
  const input = document.getElementById("name");
  const inComposition = composing || !!(event && event.isComposing);

  // 组合期间只跳过改写 value（否则会吞字），计数必须照常刷新
  if (!inComposition && measure(input.value) > MAX_WIDTH) {
    const caret = input.selectionStart;
    const kept = truncateToWidth(input.value, MAX_WIDTH);
    input.value = kept;
    // 只在光标越界时收回，避免每次输入都跳到末尾
    if (caret > kept.length) input.setSelectionRange(kept.length, kept.length);
  }

  // 计数按字位算：隐形字符不是 0，粘回生成结果时能如实反映已占用的名额
  const slots = measureSlots(input.value);
  document.getElementById("charCount").textContent = formatWidth(slots);
  document.getElementById("counter").className =
    "counter" + (slots > MAX_WIDTH ? " is-over" : "");

  // 已有结果时，输入一变就把结果标记为过期，避免复制到旧内容
  markResultStale();
}

// 预览区不显示任何提示文案，状态全部由 #status 承担
function clearResult() {
  const container = document.getElementById("result");
  container.textContent = "";
  container.className = "result";
}

// kind: "ok" 成功后自动清除 | "error" 持续显示
function setStatus(message, kind) {
  const el = document.getElementById("status");
  el.textContent = message;
  el.className = "status" + (kind ? " is-" + kind : "");
  clearTimeout(statusTimer);
  if (kind === "ok") {
    statusTimer = setTimeout(function () { el.textContent = ""; }, 6000);
  }
}

// 复制按钮：无结果或结果已过期时禁用
function updateActions() {
  document.getElementById("copyBtn").disabled = !output || stale;
}

function markResultStale() {
  if (!output || stale) return;
  stale = true;
  // 过期只用视觉标记（.is-stale + 复制禁用），状态栏不打扰
  document.getElementById("result").className = "result is-stale";
  updateActions();
}

// 用 textContent 逐节点构建，不拼接用户输入
function renderOutput() {
  const container = document.getElementById("result");
  container.textContent = "";
  for (const ch of output) {
    const box = document.createElement("div");
    box.className = "char";

    const span = document.createElement("span");
    span.className = "char-glyph";
    span.textContent = ch;
    box.appendChild(span);

    if (isInvisible(ch)) {
      const label = document.createElement("span");
      label.className = "char-code";
      label.textContent = "U+" + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
      box.appendChild(label);
    }

    container.appendChild(box);
  }
}

function generate() {
  const input = document.getElementById("name");
  let visible = "";
  for (const ch of input.value) {
    // 剥离已存在的隐形字符，重复生成不会叠加
    if (!isInvisible(ch)) visible += ch;
  }

  // 资格按字位算：每个隐形字符占 1 个字位，剩余几个字位就补几个
  const used = measureSlots(visible);
  const padCount = Math.floor(MAX_WIDTH - used);

  if (padCount < 1) {
    output = "";
    stale = false;
    clearResult();
    updateActions();
    setStatus("名称已占满 6 字上限，请删减字符后重试。", "error");
    return;
  }

  const result = Array.from(visible);
  for (let i = 0; i < padCount; i++) {
    const randomIndex = Math.floor(Math.random() * (result.length + 1));
    result.splice(randomIndex, 0, getRandomChar());
  }

  output = result.join("");
  stale = false;
  document.getElementById("result").className = "result";
  renderOutput();
  updateActions();
  setStatus(
    "已生成 " + (visible ? Array.from(visible).length + " 个可见字符 + " : "纯空白名，") +
    padCount + " 个隐形字符，共 " + (padCount + Array.from(visible).length) + "/6 个字位",
    "ok"
  );
}

async function copyResult() {
  if (!output || stale) {
    setStatus("暂无可复制的内容，请先生成名称。", "error");
    return;
  }
  if (await writeClipboard(output)) {
    setStatus("已复制 " + Array.from(output).length + " 个字符（含隐形字符）", "ok");
    return;
  }
  // 降级：自动全选，用户按键完成复制
  if (selectResult()) {
    setStatus("已全选内容，请按 Ctrl+C（手机长按选「复制」）完成复制");
  } else {
    setStatus("复制失败，请手动选中结果区域复制。", "error");
  }
}

// 只有安全上下文（HTTPS / localhost）提供 clipboard API；
// 返回 false 时由调用方降级为"全选结果 + 用户手动完成复制"，不依赖已废弃的 execCommand
async function writeClipboard(text) {
  if (!(navigator.clipboard && window.isSecureContext)) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // 权限被拒，走降级方案
    return false;
  }
}

// 全选预览区内容（含隐形字符），复制由用户按键/长按完成
function selectResult() {
  if (!window.getSelection || !document.createRange) return false;
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(document.getElementById("result"));
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

function clearAll() {
  const input = document.getElementById("name");
  input.value = "";
  output = "";
  stale = false;
  document.getElementById("charCount").textContent = "0";
  document.getElementById("counter").className = "counter";
  clearResult();
  updateActions();
  clearTimeout(statusTimer);
  document.getElementById("status").textContent = "";
  document.getElementById("status").className = "status";
  input.focus();
}

// ---- 事件绑定：替代原内联 on* 属性，配合 CSP 使用 ----
const nameInput = document.getElementById("name");
nameInput.addEventListener("input", onNameInput);
nameInput.addEventListener("compositionstart", function () {
  composing = true;
});
nameInput.addEventListener("compositionend", function (event) {
  composing = false;
  onNameInput(event);
});
document.getElementById("clearBtn").addEventListener("click", clearAll);
document.getElementById("generateBtn").addEventListener("click", generate);
document.getElementById("copyBtn").addEventListener("click", copyResult);
