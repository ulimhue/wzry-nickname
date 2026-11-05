# 王者荣耀重复名生成器

输入昵称，在名称中插入不可见 Unicode 字符，生成**看起来完全相同、系统判定不同**的名字，用于绕过重名限制。

## 使用

### 在线

> https://ulimhue.github.io/wzry-nickname/

### 本地运行

页面启用了严格 CSP，`file://` 双击打开会被浏览器拦截，需通过 HTTP 访问：

```powershell
npx serve .
# 或
python -m http.server 8000
```

### 步骤

1. 输入想要的昵称（最多 6 个字，每 2 个半角字符算 1 个字）
2. 点击「生成名称」——在随机位置插入隐形字符，实时预览每个字符及其 `U+` 码位
3. 点击「复制名称」，粘贴到游戏改名框

注意：**隐形字符同样占用 6 字上限**。名称已占满 6 字时无法插入，需删减字符后重试。

## 项目结构

```
index.html            页面结构 + CSP，无内联脚本/样式
styles.css            全部样式
app.js                全部逻辑（宽度度量、生成、渲染、剪贴板）
tools/audit.mjs       开发期审计：类名覆盖、id、零外链、CSP 等约 50 项检查
.github/workflows/    GitHub Pages 自动部署
```

## 开发

```powershell
node tools/audit.mjs   # 改动类名、样式或结构后运行，防止静默塌陷
```

推送到 `main` 即自动部署（`.github/workflows/deploy.yml`）。

## 已知限制

- 非 HTTPS 环境（如局域网 IP 访问）没有剪贴板 API 权限，复制降级为「自动全选 + 手动 Ctrl+C / 长按复制」
