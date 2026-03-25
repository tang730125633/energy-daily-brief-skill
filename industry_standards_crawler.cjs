#!/usr/bin/env node

/**
 * 行业标准网站爬取模块 v1.0
 *
 * 用途：定期从高价值行业标准网站检索能源相关标准和规范
 *       并将相关文件下载到本地审核池
 *
 * 数据来源：
 *   1. 学兔兔(原标准分享网) https://www.bzfxw.com/
 *      - /nengyuan.html (能源分类)
 *      - /dianli.html (电力分类)
 *   2. 全国标准信息公共服务平台 https://std.samr.gov.cn/
 *      - /gb/gbQuery (国标查询)
 *   3. 百度智能小程序"标准规范集" https://vmx4nq.smartapps.baidu.com
 *      - ⚠️ 此为AI聊天助手，非传统网页，暂不支持自动爬取
 *
 * 使用方式：
 *   node industry_standards_crawler.cjs [选项]
 *   --keyword <关键词>  指定搜索关键词（默认使用能源相关关键词）
 *   --download          下载匹配的标准文件到审核池
 *   --dry-run           仅检索不下载
 *   --output <目录>     下载输出目录（默认：审核池/标准文件/）
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const DEFAULT_OUTPUT = path.join(ROOT, "审核池", "标准文件");
const STATE_PATH = path.join(ROOT, "standards_state.json");

// 能源相关标准搜索关键词
const DEFAULT_KEYWORDS = [
  "电力", "储能", "光伏", "风电", "新能源",
  "电池", "充电桩", "电网", "输配电", "变电站",
  "核电", "氢能", "碳排放", "能效", "绿色电力",
];

// ============================================================
// 工具函数
// ============================================================

async function fetchText(url, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.text();
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(s) {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&emsp;/g, "").replace(/&ensp;/g, "")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ").trim();
}

function itemHash(source, title) {
  return crypto.createHash("sha256").update(`${source}|${title}`).digest("hex").slice(0, 16);
}

// ============================================================
// 学兔兔 (bzfxw.com) 爬取
// ============================================================

async function crawlBzfxw(keywords) {
  const results = [];
  const pages = [
    { name: "学兔兔-能源", url: "https://www.bzfxw.com/nengyuan.html" },
    { name: "学兔兔-电力", url: "https://www.bzfxw.com/dianli.html" },
  ];

  for (const page of pages) {
    try {
      const html = await fetchText(page.url);
      console.error(`[OK] ${page.name}: ${html.length}字节`);

      // 提取标准/文件链接
      // 格式: <a href="/nengyuan/ID.html" target="_blank">标题</a>
      // 或:   <a href="/soft/sort011/NengYuan/ID.html">标题</a>
      const pattern = /href="(\/(?:nengyuan|dianli|soft\/sort\d+\/[^"]+)\/[^"]+\.html)"[^>]*target="_blank">([^<]+)<\/a>/gi;
      let m;
      while ((m = pattern.exec(html)) !== null) {
        const title = stripHtml(m[2]).trim();
        if (title.length < 5) continue;

        // 关键词匹配
        const matched = keywords.filter(kw => title.includes(kw));
        if (matched.length === 0) continue;

        const link = "https://www.bzfxw.com" + m[1];
        results.push({
          source: page.name,
          title,
          link,
          keywords: matched,
          hash: itemHash(page.name, title),
        });
      }

      // 也提取行业标准 (SY/T, GB/T, DL/T, NB/T 等格式)
      const stdPattern = /href="(\/soft\/[^"]+\.html)"[^>]*target="_blank">([^<]*(?:GB|DL|NB|SY|JB|JJF|JJG)\/T?\s*\d+[^<]*)<\/a>/gi;
      while ((m = stdPattern.exec(html)) !== null) {
        const title = stripHtml(m[2]).trim();
        const link = "https://www.bzfxw.com" + m[1];
        const matched = keywords.filter(kw => title.includes(kw));
        if (matched.length > 0) {
          results.push({
            source: page.name,
            title,
            link,
            keywords: matched,
            hash: itemHash(page.name, title),
          });
        }
      }

      console.error(`  → ${page.name} 匹配 ${results.filter(r => r.source === page.name).length} 条`);
    } catch (err) {
      console.error(`[FAIL] ${page.name}: ${err.message}`);
    }
  }

  // 去重
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.hash)) return false;
    seen.add(r.hash);
    return true;
  });
}

// ============================================================
// 全国标准信息公共服务平台 (std.samr.gov.cn) 查询
// ============================================================

async function crawlSamr(keywords) {
  const results = [];
  const searchUrl = "https://std.samr.gov.cn/gb/search/gbQueryPage";

  for (const kw of keywords.slice(0, 8)) { // 限制查询数量避免过多请求
    try {
      // 使用POST搜索API
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(searchUrl, {
        method: "POST",
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "content-type": "application/x-www-form-urlencoded",
          "accept": "application/json, text/javascript, */*; q=0.01",
          "x-requested-with": "XMLHttpRequest",
          "referer": "https://std.samr.gov.cn/gb/gbQuery",
        },
        body: `searchText=${encodeURIComponent(kw)}&pageNo=0&pageSize=10&sortField=circulation_date&sortType=desc`,
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timer);

      if (!res.ok) {
        // 如果POST API不可用，尝试从搜索结果页面HTML提取
        console.error(`[WARN] SAMR API: ${res.status}，尝试HTML解析`);
        continue;
      }

      const data = await res.json();
      if (data && data.rows) {
        for (const row of data.rows) {
          const stdNum = row.standard_no || row.code || "";
          const stdName = row.standard_name || row.cn_name || "";
          const status = row.status_name || row.status || "";
          const pubDate = row.circulation_date || row.issue_date || "";

          if (stdName && (stdNum || stdName)) {
            results.push({
              source: "国标平台",
              title: `${stdNum} ${stdName}`.trim(),
              link: `https://std.samr.gov.cn/gb/search/gbDetailed?id=${row.id || ""}`,
              status,
              pubDate,
              keywords: [kw],
              hash: itemHash("国标平台", `${stdNum}${stdName}`),
            });
          }
        }
        console.error(`[OK] SAMR搜索"${kw}": ${data.rows.length}条结果`);
      }
    } catch (err) {
      console.error(`[FAIL] SAMR搜索"${kw}": ${err.message}`);

      // Fallback: 尝试HTML页面搜索
      try {
        const html = await fetchText(`https://std.samr.gov.cn/gb/search/gbQueryPage?searchText=${encodeURIComponent(kw)}&pageNo=0&pageSize=10`);
        // 从HTML中提取标准信息
        const pattern = /<td[^>]*>([^<]*(?:GB|DL|NB)\/T?\s*\d+[^<]*)<\/td>/gi;
        let m;
        while ((m = pattern.exec(html)) !== null) {
          const title = stripHtml(m[1]).trim();
          if (title.length > 5) {
            results.push({
              source: "国标平台",
              title,
              link: "https://std.samr.gov.cn/gb/gbQuery",
              keywords: [kw],
              hash: itemHash("国标平台", title),
            });
          }
        }
      } catch {
        // 两种方式都失败了
      }
    }
  }

  // 去重
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.hash)) return false;
    seen.add(r.hash);
    return true;
  });
}

// ============================================================
// 文件下载（从标准详情页下载PDF/DOC等）
// ============================================================

async function downloadStandardFiles(items, outputDir) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const downloaded = [];

  for (const item of items) {
    try {
      const html = await fetchText(item.link, 20000);

      // 查找下载链接
      const dlPattern = /href="([^"]+\.(pdf|doc|docx|xls|xlsx|zip|rar))"/gi;
      let m;
      while ((m = dlPattern.exec(html)) !== null) {
        const fileUrl = m[1].startsWith("http") ? m[1] : new URL(m[1], item.link).href;
        const filename = path.basename(fileUrl).replace(/[?#].*/g, "");
        const localPath = path.join(outputDir, filename);

        if (fs.existsSync(localPath)) {
          downloaded.push({ title: item.title, file: filename, status: "已存在" });
          continue;
        }

        try {
          const res = await fetch(fileUrl, { headers: { "user-agent": "Mozilla/5.0" } });
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length > 1024) { // 至少1KB才认为是有效文件
              fs.writeFileSync(localPath, buf);
              downloaded.push({ title: item.title, file: filename, size: buf.length, status: "新下载" });
              console.error(`  [DL] ${filename} (${(buf.length / 1024).toFixed(1)}KB)`);
            }
          }
        } catch {
          // 下载失败跳过
        }
      }
    } catch {
      // 详情页打不开跳过
    }
  }

  return downloaded;
}

// ============================================================
// 报告生成
// ============================================================

function renderReport(bzfxwResults, samrResults, downloaded, keywords) {
  const lines = [];
  const now = new Date();
  const timeStr = now.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

  lines.push(`行业标准检索报告`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`检索时间：${timeStr}`);
  lines.push(`搜索关键词：${keywords.join("、")}`);
  lines.push(`数据来源：学兔兔(bzfxw.com) | 全国标准信息公共服务平台(std.samr.gov.cn)`);
  lines.push("");

  lines.push(`检索概览：学兔兔 ${bzfxwResults.length}条 | 国标平台 ${samrResults.length}条`);
  lines.push("");

  if (bzfxwResults.length > 0) {
    lines.push(`【学兔兔 - 能源行业标准与资料】`);
    lines.push("");
    bzfxwResults.slice(0, 20).forEach((r, i) => {
      lines.push(`${i + 1}. ${r.title}`);
      lines.push(`   链接：${r.link}`);
      lines.push(`   命中关键词：${r.keywords.join("/")}`);
      lines.push("");
    });
    if (bzfxwResults.length > 20) {
      lines.push(`  ...及另外 ${bzfxwResults.length - 20} 条结果`);
      lines.push("");
    }
  }

  if (samrResults.length > 0) {
    lines.push(`【全国标准信息公共服务平台 - 国家标准】`);
    lines.push("");
    samrResults.slice(0, 20).forEach((r, i) => {
      lines.push(`${i + 1}. ${r.title}`);
      if (r.status) lines.push(`   状态：${r.status}`);
      if (r.pubDate) lines.push(`   发布日期：${r.pubDate}`);
      lines.push(`   链接：${r.link}`);
      lines.push("");
    });
    if (samrResults.length > 20) {
      lines.push(`  ...及另外 ${samrResults.length - 20} 条结果`);
      lines.push("");
    }
  }

  if (downloaded.length > 0) {
    lines.push(`【文件下载汇总】`);
    lines.push("");
    for (const d of downloaded) {
      const sizeStr = d.size ? ` (${(d.size / 1024).toFixed(1)}KB)` : "";
      lines.push(`  ${d.status}: ${d.file}${sizeStr} — ${d.title}`);
    }
    lines.push("");
  }

  lines.push(`\n注：百度智能小程序"标准规范集"(vmx4nq.smartapps.baidu.com)为AI聊天助手，不支持自动爬取。`);
  lines.push(`如需查询该平台内容，请在百度App中打开小程序手动检索。`);

  return lines.join("\n");
}

// ============================================================
// 状态管理
// ============================================================

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { crawled_hashes: [], last_run: null };
  try { return JSON.parse(fs.readFileSync(STATE_PATH, "utf8")); }
  catch { return { crawled_hashes: [], last_run: null }; }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const DRY_RUN = args.includes("--dry-run");
  const DO_DOWNLOAD = args.includes("--download");
  const kwIdx = args.indexOf("--keyword");
  const outIdx = args.indexOf("--output");

  const keywords = kwIdx >= 0 ? [args[kwIdx + 1]] : DEFAULT_KEYWORDS;
  const outputDir = outIdx >= 0 ? args[outIdx + 1] : DEFAULT_OUTPUT;

  console.error(`\n=== 行业标准检索系统 v1.0 ===`);
  console.error(`关键词：${keywords.join("、")}`);
  console.error(`输出目录：${outputDir}`);
  console.error(`模式：${DRY_RUN ? "DRY-RUN" : DO_DOWNLOAD ? "检索+下载" : "仅检索"}`);
  console.error("");

  // 加载历史状态
  const state = loadState();
  const knownHashes = new Set(state.crawled_hashes || []);

  // 1. 爬取学兔兔
  console.error("--- 爬取学兔兔 ---");
  const bzfxwResults = await crawlBzfxw(keywords);
  const newBzfxw = bzfxwResults.filter(r => !knownHashes.has(r.hash));
  console.error(`学兔兔：${bzfxwResults.length}条匹配，其中${newBzfxw.length}条新增`);

  // 2. 查询国标平台
  console.error("\n--- 查询全国标准信息公共服务平台 ---");
  const samrResults = await crawlSamr(keywords);
  const newSamr = samrResults.filter(r => !knownHashes.has(r.hash));
  console.error(`国标平台：${samrResults.length}条匹配，其中${newSamr.length}条新增`);

  // 3. 下载文件
  let downloaded = [];
  if (DO_DOWNLOAD && !DRY_RUN) {
    console.error("\n--- 下载标准文件 ---");
    const allNew = [...newBzfxw, ...newSamr];
    downloaded = await downloadStandardFiles(allNew, outputDir);
    console.error(`下载完成：${downloaded.length}个文件`);
  }

  // 4. 生成报告
  const report = renderReport(newBzfxw, newSamr, downloaded, keywords);
  const reportPath = path.join(ROOT, "审核池", "标准文件", `标准检索_${new Date().toISOString().slice(0, 10)}.md`);
  if (!fs.existsSync(path.dirname(reportPath))) fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report + "\n", "utf8");
  console.error(`\n报告已保存: ${reportPath}`);

  // 5. 更新状态
  if (!DRY_RUN) {
    const allHashes = [...bzfxwResults, ...samrResults].map(r => r.hash);
    state.crawled_hashes = [...(state.crawled_hashes || []), ...allHashes].slice(-5000);
    state.last_run = new Date().toISOString();
    saveState(state);
  }

  // 6. 输出
  process.stdout.write(report + "\n");
}

main().catch(err => {
  console.error(`\n致命错误: ${err.message}`);
  process.exit(1);
});
