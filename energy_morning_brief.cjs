#!/usr/bin/env node

/**
 * 能源行业早报系统 v3.1 — 精简格式版
 *
 * 设计逻辑：
 *   7:30 预爬取 → 下载附件到审核池
 *   8:00 生成早报 → 推送企业微信
 *
 * 数据来源（以下7个站点）：
 *   1. 国家发改委 https://www.ndrc.gov.cn/
 *   2. 国家能源局 https://www.nea.gov.cn/
 *   3. 华中监管局 https://hzj.nea.gov.cn/
 *   4. 湖北省发改委(能源局) https://fgw.hubei.gov.cn/
 *   5. 长江金属铜价 https://copper.ccmn.cn/copperprice/
 *   6. 世纪新能源网 https://www.ne21.com/
 *   7. 中国能源网 https://www.china5e.com/
 *
 * 核心原则：
 *   - 只取昨天发布的内容（按日期严格过滤）
 *   - 不重复（SHA256哈希去重 + 14天窗口）
 *   - 返回真实超链接
 *   - 下载附件到按日期分类的审核池
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// ============================================================
// 路径配置
// ============================================================

const ROOT = __dirname;
const STATE_PATH = path.join(ROOT, "morning_state.json");
const LOG_PATH = path.join(ROOT, "morning_report_log.md");
const AUDIT_POOL_ROOT = path.join(ROOT, "审核池");

// ============================================================
// 关键词（戴总指定的21个 + 补充16个）
// ============================================================

const KEYWORDS = [
  // 戴总指定
  "电网", "能源", "电力", "电价", "光伏", "容量",
  "绿电直连", "零碳", "低碳", "新能源", "分布式", "集中式",
  "用电", "供电", "发电", "储能", "氢能", "充电桩",
  "碳中和", "碳达峰", "碳",
  // 补充
  "风电", "核电", "水电", "电池", "特高压",
  "可再生", "清洁能源", "绿证", "绿电",
  "电力市场", "输配电", "售电", "上网电价",
  "并网", "消纳", "装机",
];

// ============================================================
// 站点定义
// ============================================================

const NDRC_PAGES = [
  { name: "发改委-通知", url: "https://www.ndrc.gov.cn/xxgk/zcfb/tz/", base: "https://www.ndrc.gov.cn/xxgk/zcfb/tz/" },
  { name: "发改委-规范性文件", url: "https://www.ndrc.gov.cn/xxgk/zcfb/ghxwj/", base: "https://www.ndrc.gov.cn/xxgk/zcfb/ghxwj/" },
  { name: "发改委-令", url: "https://www.ndrc.gov.cn/xxgk/zcfb/fzggwl/", base: "https://www.ndrc.gov.cn/xxgk/zcfb/fzggwl/" },
  { name: "发改委-公告", url: "https://www.ndrc.gov.cn/xxgk/zcfb/gg/", base: "https://www.ndrc.gov.cn/xxgk/zcfb/gg/" },
];

const NEA_PAGES = [
  { name: "能源局-首页", url: "https://www.nea.gov.cn/", base: "https://www.nea.gov.cn/", pattern: "nea-home" },
  { name: "能源局-新能源司", url: "https://www.nea.gov.cn/sjzz/xny/", base: "https://www.nea.gov.cn/sjzz/xny/" },
  { name: "能源局-电力司", url: "https://www.nea.gov.cn/sjzz/dls/", base: "https://www.nea.gov.cn/sjzz/dls/" },
  { name: "能源局-规划司", url: "https://www.nea.gov.cn/sjzz/ghs/", base: "https://www.nea.gov.cn/sjzz/ghs/" },
];

const HZJ_PAGES = [
  { name: "华中监管局-监管动态", url: "https://hzj.nea.gov.cn/dtyw/jgdt/", base: "https://hzj.nea.gov.cn/dtyw/jgdt/" },
  { name: "华中监管局-通知公告", url: "https://hzj.nea.gov.cn/dtyw/tzgg/", base: "https://hzj.nea.gov.cn/dtyw/tzgg/" },
  { name: "华中监管局-重要信息", url: "https://hzj.nea.gov.cn/dtyw/zyxx/", base: "https://hzj.nea.gov.cn/dtyw/zyxx/" },
  { name: "华中监管局-时政要闻", url: "https://hzj.nea.gov.cn/dtyw/szyw/", base: "https://hzj.nea.gov.cn/dtyw/szyw/" },
];

// 湖北省发改委-能源局（挂在发改委下，无独立网站）
// 注意：该站有WAF防护(412/JS Challenge)，简单HTTP可能失败，脚本会自动重试
const HUBEI_PAGES = [
  { name: "湖北能源局-通知公告", url: "https://fgw.hubei.gov.cn/gzjj/tzgg/", base: "https://fgw.hubei.gov.cn/gzjj/tzgg/", suffix: ".shtml" },
  { name: "湖北能源局-新能源处", url: "https://fgw.hubei.gov.cn/fbjd/xxgkml/jgzn/wgdw/nyj/xnyhkzsnyc/tzgg/", base: "https://fgw.hubei.gov.cn/fbjd/xxgkml/jgzn/wgdw/nyj/xnyhkzsnyc/tzgg/", suffix: ".shtml" },
  { name: "湖北能源局-电力监管", url: "https://fgw.hubei.gov.cn/fbjd/xxgkml/jgzn/wgdw/nyj/dljsc/gzdt/", base: "https://fgw.hubei.gov.cn/fbjd/xxgkml/jgzn/wgdw/nyj/dljsc/gzdt/", suffix: ".shtml" },
  { name: "湖北能源局-能源规划", url: "https://fgw.hubei.gov.cn/fbjd/xxgkml/jgzn/wgdw/nyj/nyfzzlc/tzgg/", base: "https://fgw.hubei.gov.cn/fbjd/xxgkml/jgzn/wgdw/nyj/nyfzzlc/tzgg/", suffix: ".shtml" },
];

// 世纪新能源网（光伏风电储能氢能行业媒体）
const NE21_PAGES = [
  { name: "世纪新能源-资讯", url: "https://www.ne21.com/news/", base: "https://www.ne21.com" },
];

// 中国能源网（国家级能源新闻媒体）— 主新闻页包含所有分类且带日期
const CHINA5E_PAGES = [
  { name: "中国能源网-新闻", url: "https://www.china5e.com/news/", base: "https://www.china5e.com" },
];

// 长江金属铜价列表页
const COPPER_PRICE_URL = "https://copper.ccmn.cn/copperprice/";

// ============================================================
// 工具函数
// ============================================================

function getBeijingNow() {
  // 获取北京时间（UTC+8）
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  return new Date(utcMs + 8 * 60 * 60 * 1000);
}

function formatDateTime(d) {
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, "0");
  const D = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${Y}-${M}-${D} ${h}:${m}`;
}

function formatDate(d) {
  return formatDateTime(d).slice(0, 10);
}

function getYesterdayDate(bjNow) {
  const y = new Date(bjNow);
  y.setDate(y.getDate() - 1);
  return formatDate(y);
}

function itemHash(source, title, link) {
  return crypto.createHash("sha256").update(`${source}|${title}|${link}`).digest("hex");
}

function stripHtml(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&emsp;/g, "").replace(/&ensp;/g, "").replace(/&rdquo;/g, "\u201D").replace(/&ldquo;/g, "\u201C")
    .replace(/&mdash;/g, "—").replace(/&hellip;/g, "…").replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ").trim();
}

function matchesKeyword(text) {
  return KEYWORDS.some(kw => text.includes(kw));
}

function matchedKeywords(text) {
  return KEYWORDS.filter(kw => text.includes(kw));
}

function extractDateFromUrl(url) {
  const m1 = url.match(/t(\d{4})(\d{2})(\d{2})_/);
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
  const m2 = url.match(/\/(\d{4})(\d{2})(\d{2})\//);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return null;
}

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

// ============================================================
// 页面解析器
// ============================================================

function parseGovListPage(html, sourceName, baseUrl) {
  const items = [];
  const seenUrls = new Set();

  function addItem(relPath, title) {
    const cleanTitle = stripHtml(title).trim();
    if (cleanTitle.length < 5) return;
    let fullUrl;
    try { fullUrl = new URL(relPath, baseUrl).href; } catch { return; }
    if (seenUrls.has(fullUrl)) return;
    seenUrls.add(fullUrl);
    const dateStr = extractDateFromUrl(fullUrl);
    items.push({
      source: sourceName,
      title: cleanTitle,
      link: fullUrl,
      dateStr,
      key: itemHash(sourceName, cleanTitle, fullUrl),
    });
  }

  // 模式1: <a href="./path" title="标题">
  const p1 = /<a[^>]+href="(\.[^"]+\.html?)"[^>]*title="([^"]+)"/gi;
  let m;
  while ((m = p1.exec(html)) !== null) addItem(m[1], m[2]);

  // 模式2: <a href="./path"><span>标题</span>
  const p2 = /<a[^>]+href="(\.[^"]+\.html?)"[^>]*>\s*<span[^>]*>([^<]{5,})<\/span>/gi;
  while ((m = p2.exec(html)) !== null) addItem(m[1], m[2]);

  // 模式3: <a href="./path">标题文字</a>
  const p3 = /<a[^>]+href="(\.[^"]+\.html?)"[^>]*>([^<]{8,80})<\/a>/gi;
  while ((m = p3.exec(html)) !== null) addItem(m[1], m[2]);

  // 模式4: <a href="./path" title="标题"> (以/开头)
  const p4 = /<a[^>]+href="((?:\.\/|\/)[^"]+\.html?)"[^>]*title="([^"]+)"/gi;
  while ((m = p4.exec(html)) !== null) addItem(m[1], m[2]);

  // 模式5: <li><a href="./path"><span>标题</span></a>
  const p5 = /<li[^>]*>\s*<a[^>]+href="(\.[^"]+\.html?)"[^>]*>\s*(?:<span[^>]*>)?([^<]{5,})(?:<\/span>)?\s*<\/a>/gi;
  while ((m = p5.exec(html)) !== null) addItem(m[1], m[2]);

  return items;
}

function parseNeaHomePage(html, sourceName, baseUrl) {
  const items = [];
  const pattern = /<a[^>]+href="(202\d[^"]+\/c\.html)"[^>]*>([^<]{8,80})<\/a>/gi;
  let m;
  while ((m = pattern.exec(html)) !== null) {
    const cleanTitle = stripHtml(m[2]).trim();
    if (cleanTitle.length < 8) continue;
    let fullUrl;
    try { fullUrl = new URL(m[1], baseUrl).href; } catch { continue; }
    const dateStr = extractDateFromUrl(fullUrl);
    items.push({
      source: sourceName,
      title: cleanTitle,
      link: fullUrl,
      dateStr,
      key: itemHash(sourceName, cleanTitle, fullUrl),
    });
  }
  return items;
}

// ============================================================
// 湖北省发改委列表页解析（TRS CMS + .shtml格式）
// ============================================================

function parseHubeiListPage(html, sourceName, baseUrl) {
  const items = [];
  const seenUrls = new Set();

  function addItem(relPath, title) {
    const cleanTitle = stripHtml(title).trim();
    if (cleanTitle.length < 5) return;
    let fullUrl;
    try { fullUrl = new URL(relPath, baseUrl).href; } catch { return; }
    if (seenUrls.has(fullUrl)) return;
    seenUrls.add(fullUrl);
    const dateStr = extractDateFromUrl(fullUrl);
    items.push({
      source: sourceName,
      title: cleanTitle,
      link: fullUrl,
      dateStr,
      key: itemHash(sourceName, cleanTitle, fullUrl),
    });
  }

  // 湖北TRS CMS模式: <a href="./202603/tYYYYMMDD_XXXXX.shtml" title="标题">
  const p1 = /<a[^>]+href="(\.[^"]+\.shtml)"[^>]*title="([^"]+)"/gi;
  let m;
  while ((m = p1.exec(html)) !== null) addItem(m[1], m[2]);

  // 模式2: <a href="路径.shtml">标题文字</a>
  const p2 = /<a[^>]+href="([^"]+\.shtml)"[^>]*>([^<]{8,120})<\/a>/gi;
  while ((m = p2.exec(html)) !== null) addItem(m[1], m[2]);

  // 模式3: <a href="路径.shtml"><span>标题</span>
  const p3 = /<a[^>]+href="([^"]+\.shtml)"[^>]*>\s*<span[^>]*>([^<]{5,})<\/span>/gi;
  while ((m = p3.exec(html)) !== null) addItem(m[1], m[2]);

  // 也尝试通用模式（.html后缀，兼容部分页面）
  const p4 = /<a[^>]+href="(\.[^"]+\.html?)"[^>]*title="([^"]+)"/gi;
  while ((m = p4.exec(html)) !== null) addItem(m[1], m[2]);

  const p5 = /<a[^>]+href="(\.[^"]+\.html?)"[^>]*>([^<]{8,80})<\/a>/gi;
  while ((m = p5.exec(html)) !== null) addItem(m[1], m[2]);

  return items;
}

// ============================================================
// 世纪新能源网解析
// ============================================================

function parseNe21Page(html, sourceName) {
  const items = [];
  const seenUrls = new Set();

  // 格式: <li class="blogs_list"><a href="https://www.ne21.com/news/show-XXXXXX.html" title="标题">
  // 日期: <span class="blogs_time">2026-03-25 09:04</span>
  const blockPattern = /<li\s+class="blogs_list">([\s\S]*?)<\/li>/gi;
  let block;
  while ((block = blockPattern.exec(html)) !== null) {
    const content = block[1];

    // 提取链接和标题
    const linkMatch = content.match(/<a[^>]+href="(https?:\/\/www\.ne21\.com\/news\/show-\d+\.html)"[^>]*title="([^"]+)"/i);
    if (!linkMatch) continue;

    const link = linkMatch[1];
    const title = stripHtml(linkMatch[2]).trim();
    if (title.length < 5 || seenUrls.has(link)) continue;
    seenUrls.add(link);

    // 提取日期（最后一个 blogs_time 通常是发布日期）
    const dateMatches = content.match(/(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}/g);
    const dateStr = dateMatches ? dateMatches[dateMatches.length - 1].slice(0, 10) : null;

    // 提取摘要（<p>标签中的文字）
    const summaryMatch = content.match(/<p>([^<]{10,})<\/p>/);
    const summary = summaryMatch ? stripHtml(summaryMatch[1]).trim() : "";

    items.push({
      source: sourceName,
      title,
      link,
      dateStr,
      summary,
      key: itemHash(sourceName, title, link),
    });
  }
  return items;
}

// ============================================================
// 中国能源网解析
// ============================================================

function parseChina5ePage(html, sourceName, baseUrl) {
  const items = [];
  const seenUrls = new Set();

  function addItem(link, title, dateStr) {
    const cleanTitle = stripHtml(title).trim();
    if (cleanTitle.length < 5) return;
    let fullUrl;
    try { fullUrl = new URL(link, baseUrl).href; } catch { return; }
    if (seenUrls.has(fullUrl)) return;
    seenUrls.add(fullUrl);
    items.push({
      source: sourceName,
      title: cleanTitle,
      link: fullUrl,
      dateStr: dateStr || null,
      key: itemHash(sourceName, cleanTitle, fullUrl),
    });
  }

  // 模式1（主新闻页 /news/）: <li><span>2026-03-25</span>...<a href="news-ID-1.html" title="标题">
  const p1 = /<li>\s*<span>(20\d{2}-\d{2}-\d{2})<\/span>[\s\S]*?<a[^>]+href="([^"]*news-\d+-1\.html)"[^>]*title="([^"]+)"/gi;
  let m;
  while ((m = p1.exec(html)) !== null) addItem(m[2], m[3], m[1]);

  // 模式2（分类页）: <li class="singleline"><a href="news-ID-1.html" title="标题">
  const p2 = /<li[^>]*class="singleline"[^>]*>\s*<a[^>]+href="([^"]*news-\d+-1\.html)"[^>]*title="([^"]+)"/gi;
  while ((m = p2.exec(html)) !== null) addItem(m[1], m[2], null);

  // 模式3（分类页大图区）: <h3 class="singleline"><a href="news-ID-1.html" title="标题">
  const p3 = /<h3[^>]*>\s*<a[^>]+href="([^"]*news-\d+-1\.html)"[^>]*title="([^"]+)"/gi;
  while ((m = p3.exec(html)) !== null) addItem(m[1], m[2], null);

  return items;
}

// ============================================================
// 铜价解析
// ============================================================

function parseCopperPricePage(html, targetDate) {
  const items = [];

  // 匹配铜价文章列表: <a href="//copper.ccmn.cn/copperprice/2026-03-24/xxx.html">03月24日长江铜价格行情参考</a>
  const pattern = /<a[^>]+href="(\/\/copper\.ccmn\.cn\/copperprice\/[^"]+\.html)"[^>]*>\s*([^<]*长江[^<]*铜[^<]*)<\/a>/gi;
  let m;
  while ((m = pattern.exec(html)) !== null) {
    const link = "https:" + m[1];
    const title = stripHtml(m[2]).trim();
    // 从URL中提取日期
    const dateMatch = link.match(/copperprice\/(\d{4}-\d{2}-\d{2})\//);
    const dateStr = dateMatch ? dateMatch[1] : null;
    if (dateStr === targetDate) {
      items.push({
        source: "长江金属-铜价",
        title: title,
        link: link,
        dateStr: dateStr,
        key: itemHash("长江金属-铜价", title, link),
      });
    }
  }

  // 去重
  const seen = new Set();
  return items.filter(it => {
    if (seen.has(it.title)) return false;
    seen.add(it.title);
    return true;
  });
}

// ============================================================
// 数据抓取
// ============================================================

async function crawlAllSites(targetDate) {
  const allItems = [];
  const errors = [];
  const stats = { ndrc: 0, nea: 0, hzj: 0, hubei: 0, ne21: 0, china5e: 0, copper: 0 };

  // 发改委
  for (const page of NDRC_PAGES) {
    try {
      const html = await fetchText(page.url);
      const items = parseGovListPage(html, page.name, page.base);
      const dated = items.filter(it => it.dateStr === targetDate);
      allItems.push(...dated);
      stats.ndrc += dated.length;
      console.error(`[OK] ${page.name}: ${items.length}条 → 昨日${dated.length}条`);
    } catch (err) {
      errors.push(`${page.name}: ${err.message}`);
      console.error(`[FAIL] ${page.name}: ${err.message}`);
    }
  }

  // 能源局
  for (const page of NEA_PAGES) {
    try {
      const html = await fetchText(page.url);
      let items;
      if (page.pattern === "nea-home") {
        items = parseNeaHomePage(html, page.name, page.base);
      } else {
        items = parseGovListPage(html, page.name, page.base);
        if (items.length === 0) items = parseNeaHomePage(html, page.name, page.base);
      }
      const dated = items.filter(it => it.dateStr === targetDate);
      allItems.push(...dated);
      stats.nea += dated.length;
      console.error(`[OK] ${page.name}: ${items.length}条 → 昨日${dated.length}条`);
    } catch (err) {
      errors.push(`${page.name}: ${err.message}`);
      console.error(`[FAIL] ${page.name}: ${err.message}`);
    }
  }

  // 华中监管局
  for (const page of HZJ_PAGES) {
    try {
      const html = await fetchText(page.url);
      let items = parseGovListPage(html, page.name, page.base);
      if (items.length === 0) items = parseNeaHomePage(html, page.name, page.base);
      const dated = items.filter(it => it.dateStr === targetDate);
      allItems.push(...dated);
      stats.hzj += dated.length;
      console.error(`[OK] ${page.name}: ${items.length}条 → 昨日${dated.length}条`);
    } catch (err) {
      errors.push(`${page.name}: ${err.message}`);
      console.error(`[FAIL] ${page.name}: ${err.message}`);
    }
  }

  // 湖北省发改委(能源局)
  for (const page of HUBEI_PAGES) {
    try {
      const html = await fetchText(page.url, 20000);
      // 检查WAF拦截（返回空页面或JS挑战）
      if (html.length < 500 || html.includes("$_ss")) {
        console.error(`[WARN] ${page.name}: 疑似WAF拦截(${html.length}字节)，跳过`);
        errors.push(`${page.name}: WAF拦截，无法获取内容`);
        continue;
      }
      let items = parseHubeiListPage(html, page.name, page.base);
      if (items.length === 0) {
        // fallback: 尝试通用解析器
        items = parseGovListPage(html, page.name, page.base);
      }
      const dated = items.filter(it => it.dateStr === targetDate);
      allItems.push(...dated);
      stats.hubei += dated.length;
      console.error(`[OK] ${page.name}: ${items.length}条 → 昨日${dated.length}条`);
    } catch (err) {
      errors.push(`${page.name}: ${err.message}`);
      console.error(`[FAIL] ${page.name}: ${err.message}`);
    }
  }

  // 世纪新能源网
  for (const page of NE21_PAGES) {
    try {
      const html = await fetchText(page.url);
      const items = parseNe21Page(html, page.name);
      const dated = items.filter(it => it.dateStr === targetDate);
      allItems.push(...dated);
      stats.ne21 += dated.length;
      console.error(`[OK] ${page.name}: ${items.length}条 → 目标日${dated.length}条`);
    } catch (err) {
      errors.push(`${page.name}: ${err.message}`);
      console.error(`[FAIL] ${page.name}: ${err.message}`);
    }
  }

  // 中国能源网（主新闻页有日期，分类页无日期则视为当天内容）
  for (const page of CHINA5E_PAGES) {
    try {
      const html = await fetchText(page.url);
      const items = parseChina5ePage(html, page.name, page.base);
      // 有日期的按日期过滤；无日期的视为最新内容直接纳入
      const dated = items.filter(it => it.dateStr === targetDate || it.dateStr === null);
      // 无日期的补上targetDate
      dated.forEach(it => { if (!it.dateStr) it.dateStr = targetDate; });
      allItems.push(...dated);
      stats.china5e += dated.length;
      console.error(`[OK] ${page.name}: ${items.length}条 → 目标日${dated.length}条`);
    } catch (err) {
      errors.push(`${page.name}: ${err.message}`);
      console.error(`[FAIL] ${page.name}: ${err.message}`);
    }
  }

  // 长江金属铜价
  try {
    const html = await fetchText(COPPER_PRICE_URL);
    const copperItems = parseCopperPricePage(html, targetDate);
    allItems.push(...copperItems);
    stats.copper = copperItems.length;
    console.error(`[OK] 长江金属-铜价: 昨日${copperItems.length}条`);
  } catch (err) {
    errors.push(`长江金属-铜价: ${err.message}`);
    console.error(`[FAIL] 长江金属-铜价: ${err.message}`);
  }

  return { allItems, errors, stats };
}

// ============================================================
// 去重
// ============================================================

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { reported_keys: [], last_run: null };
  try { return JSON.parse(fs.readFileSync(STATE_PATH, "utf8")); }
  catch { return { reported_keys: [], last_run: null }; }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}

function dedup(items, state) {
  const reported = new Set(state.reported_keys || []);

  // 1. 哈希去重（已发过的不再发）
  let filtered = items.filter(it => !reported.has(it.key));

  // 2. 关键词匹配（铜价条目、世纪新能源网和中国能源网内容不需要关键词过滤）
  filtered = filtered.filter(it =>
    it.source === "长江金属-铜价" ||
    it.source.startsWith("世纪") ||
    it.source.startsWith("中国能源") ||
    matchesKeyword(it.title)
  );

  // 3. 标题去重
  const seen = new Set();
  filtered = filtered.filter(it => {
    const norm = it.title.replace(/\s+/g, "");
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });

  return filtered;
}

// ============================================================
// 附件下载（下载到审核池）
// ============================================================

async function downloadAttachments(items, auditDir) {
  const downloaded = [];

  for (const item of items) {
    // 铜价文章不需要下载附件
    if (item.source === "长江金属-铜价") continue;

    try {
      const html = await fetchText(item.link, 20000);

      // 查找附件链接（PDF/DOC/XLS等）
      const attachPattern = /href="([^"]+\.(pdf|doc|docx|xls|xlsx))/gi;
      let am;
      while ((am = attachPattern.exec(html)) !== null) {
        const attachUrl = am[1].startsWith("http") ? am[1] : new URL(am[1], item.link).href;
        const filename = path.basename(attachUrl).replace(/[?#].*/g, "");
        const localPath = path.join(auditDir, filename);

        if (fs.existsSync(localPath)) {
          downloaded.push({ title: item.title, file: filename, path: localPath, status: "已存在" });
          continue;
        }

        try {
          const res = await fetch(attachUrl, {
            headers: { "user-agent": "Mozilla/5.0" },
          });
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            fs.writeFileSync(localPath, buf);
            downloaded.push({ title: item.title, file: filename, path: localPath, status: "新下载", size: buf.length });
            console.error(`  [DL] ${filename} (${(buf.length / 1024).toFixed(1)}KB)`);
          }
        } catch (dlErr) {
          console.error(`  [DL-FAIL] ${filename}: ${dlErr.message}`);
        }
      }

      // 检查页面本身是否可以作为PDF保存（如果有"打印"或"下载"按钮）
      // 政府页面通常可以用打印功能另存PDF，这里记录页面链接即可
    } catch {
      // 页面打不开跳过
    }
  }
  return downloaded;
}

// ============================================================
// 摘要提取（从详情页抓正文）
// ============================================================

async function fetchArticleSummary(item) {
  try {
    const html = await fetchText(item.link, 20000);

    // 铜价文章：提取价格表数据
    if (item.source === "长江金属-铜价") {
      return extractCopperPriceDetail(html, item);
    }

    // 政府文章：提取正文摘要
    return extractGovArticleSummary(html);
  } catch {
    return { summary: "（摘要获取失败）", value: "" };
  }
}

function extractGovArticleSummary(html) {
  // 移除script和style
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // 尝试提取正文区域（政府网站常见class名）
  const contentPatterns = [
    /<div[^>]+class="[^"]*(?:TRS_Editor|article_con|pages_content|content|text|zoom)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]+id="[^"]*(?:content|article|text|zoom)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<td[^>]+class="[^"]*b12c[^"]*"[^>]*>([\s\S]*?)<\/td>/i,
  ];

  let bodyText = "";
  for (const p of contentPatterns) {
    const m = text.match(p);
    if (m && m[1]) {
      bodyText = stripHtml(m[1]);
      if (bodyText.length > 30) break;
    }
  }

  // fallback: 从全页面提取有意义的文本段落
  if (bodyText.length < 30) {
    const paragraphs = text.match(/<p[^>]*>([^<]{20,})<\/p>/gi);
    if (paragraphs) {
      bodyText = paragraphs.slice(0, 5).map(p => stripHtml(p)).join(" ");
    }
  }

  if (bodyText.length < 10) {
    return { summary: "（正文内容较少或格式特殊）", value: "" };
  }

  // 截取前200字
  const summary = bodyText.length > 200 ? bodyText.slice(0, 200) + "..." : bodyText;
  return { summary };
}

function extractCopperPriceDetail(html, item) {
  // 尝试从铜价详情页提取价格数据（结构化）
  const result = { summary: "", value: "每日铜价参考，影响铜材采购成本和报价决策。" };
  const priceData = {}; // 结构化铜价数据

  // 匹配表格中的数字（价格通常是5位数，如76540）
  const pricePattern = /<td[^>]*>(\d{4,6})<\/td>/gi;
  const prices = [];
  let m;
  while ((m = pricePattern.exec(html)) !== null) {
    const num = parseInt(m[1]);
    if (num > 30000 && num < 200000) prices.push(num);
  }

  if (prices.length >= 2) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const avg = Math.round((min + max) / 2);
    priceData.min = min;
    priceData.max = max;
    priceData.avg = avg;
    result.summary = `1#铜均价**${avg}元/吨**，价格区间${min}-${max}元/吨。`;
  }

  // 尝试匹配涨跌幅
  const changePattern = /[涨跌幅].*?([+-]?\d{1,5})/;
  const textContent = stripHtml(html);
  const changeMatch = textContent.match(changePattern);
  if (changeMatch) {
    priceData.change = changeMatch[1];
  }

  // 尝试匹配升贴水
  const premiumPattern = /升贴水.*?([+-]?\d{1,5})/;
  const premiumMatch = textContent.match(premiumPattern);
  if (premiumMatch) {
    priceData.premium = premiumMatch[1];
  }

  if (!result.summary) {
    const priceMatch = textContent.match(/(\d{4,6})\s*[-~]\s*(\d{4,6})/);
    if (priceMatch) {
      priceData.min = parseInt(priceMatch[1]);
      priceData.max = parseInt(priceMatch[2]);
      priceData.avg = Math.round((priceData.min + priceData.max) / 2);
      result.summary = `1#铜均价**${priceData.avg}元/吨**，价格区间${priceMatch[1]}-${priceMatch[2]}元/吨。`;
    }
  }

  if (!result.summary) {
    result.summary = `${item.title}（详细价格请点击链接查看）。`;
  }

  // 存储结构化数据供渲染使用
  result.priceData = priceData;
  return result;
}

// 根据标题自动生成价值分析
function generateValue(item) {
  const t = item.title;

  // 铜价
  if (item.source === "长江金属-铜价") return "每日铜价参考，影响铜材采购成本和报价决策。";

  // 政策类
  if (/通知|意见|办法|规定|规划|方案/.test(t)) {
    if (/电价|容量/.test(t)) return "电价政策直接影响企业用电成本和储能投资收益。";
    if (/光伏|风电|新能源/.test(t)) return "新能源政策影响项目审批、补贴和并网条件。";
    if (/碳|绿电|绿证/.test(t)) return "碳交易与绿电政策影响企业碳成本和绿色转型战略。";
    if (/储能|电池/.test(t)) return "储能政策影响投资建设节奏和商业模式。";
    if (/电网|输配电/.test(t)) return "电网政策影响输配电价和电力市场改革进程。";
    return "政策文件，可能影响行业发展方向和企业经营策略。";
  }

  // 监管类
  if (/监管|检查|整治|督导|安全/.test(t)) return "监管动态，关注合规要求和安全标准变化。";
  if (/市场|交易|竞价|现货/.test(t)) return "电力市场动态，影响交易策略和电价预期。";
  if (/并网|装机|投产/.test(t)) return "项目进展信息，影响行业供需格局判断。";

  // 默认
  return "行业动态，值得关注。";
}

// 根据当日内容自动生成机会提示（返回多条具体可操作建议）
function generateOpportunity(items) {
  const titles = items.map(it => it.title).join(" ");
  const hints = [];

  // 铜价相关
  const copperItem = items.find(it => it.source === "长江金属-铜价");
  if (copperItem) {
    const pd = copperItem.priceData || {};
    if (pd.change && parseInt(pd.change) < -500) {
      hints.push(`铜价回调${Math.abs(parseInt(pd.change))}元/吨，下游采购窗口打开，可适时锁定采购`);
    } else if (pd.change && parseInt(pd.change) > 500) {
      hints.push(`铜价上涨${pd.change}元/吨，建议关注库存管理和成本传导`);
    } else if (pd.avg) {
      hints.push(`关注铜价走势（均价${pd.avg}元/吨），合理安排采购节奏`);
    }
  }

  if (/电价.*调整|容量电价|上网电价/.test(titles)) {
    hints.push("电价政策调整窗口期，关注储能和售电业务套利空间变化");
  }
  if (/光伏.*GW|光伏.*投产|光伏.*并网|分布式/.test(titles)) {
    hints.push("光伏项目动态频繁，关注组件采购窗口及分布式项目备案机会");
  }
  if (/储能.*项目|储能.*招标|储能.*GWh/.test(titles)) {
    hints.push("储能市场活跃，关注工商业储能项目配套及运维服务机会");
  }
  if (/充电桩|充电设施|换电/.test(titles)) {
    hints.push("充换电基础设施建设加速，关注充电桩运营及电力增容服务");
  }
  if (/碳交易|碳排放|CCER|绿证|绿电/.test(titles)) {
    hints.push("碳市场政策动态，评估企业碳资产管理和绿证交易机会");
  }
  if (/电力市场|现货|竞价/.test(titles)) {
    hints.push("电力市场化改革深入，关注售电侧和需求响应业务增长点");
  }
  if (/氢能|制氢|加氢/.test(titles)) {
    hints.push("氢能产业链政策利好，关注制氢/储运/加注环节投资布局");
  }
  if (/风电|海上风电/.test(titles)) {
    hints.push("风电行业动态活跃，关注海上风电和风电运维市场机会");
  }
  if (/核电|核能/.test(titles)) {
    hints.push("核电项目进展，关注核电设备供应链及配套服务机会");
  }

  // 如果没有匹配到任何，给默认
  if (hints.length === 0) {
    hints.push("持续跟踪能源政策动态，把握绿色转型中的业务增长机会");
    hints.push("关注本周政策发布窗口，及时调整项目推进节奏");
  }

  return hints.slice(0, 3); // 最多3条
}

// ============================================================
// 来源分类
// ============================================================

function sourceTag(item) {
  if (item.source.startsWith("发改委")) return "国家发改委";
  if (item.source.startsWith("能源局")) return "国家能源局";
  if (item.source.startsWith("华中")) return "华中监管局";
  if (item.source.startsWith("湖北")) return "湖北省能源局";
  if (item.source.startsWith("世纪")) return "世纪新能源网";
  if (item.source.startsWith("中国能源")) return "中国能源网";
  if (item.source.startsWith("长江")) return "长江金属";
  return "其他";
}

function policyTag(item) {
  const t = item.title;
  if (/铜/.test(t)) return "铜价行情";
  if (/电价|容量电价|上网电价|输配电|售电|电力市场/.test(t)) return "电价与市场";
  if (/光伏|太阳能|分布式|集中式/.test(t)) return "光伏";
  if (/风电|风力|海上风电/.test(t)) return "风电";
  if (/储能|电池|蓄电/.test(t)) return "储能";
  if (/氢能|制氢|氢燃料/.test(t)) return "氢能";
  if (/核电|核能/.test(t)) return "核电";
  if (/电网|特高压|配电网/.test(t)) return "电网";
  if (/充电桩|充电设施|换电/.test(t)) return "充换电";
  if (/碳中和|碳达峰|碳交易|碳排放|低碳|零碳|绿电|绿证/.test(t)) return "碳与绿电";
  if (/新能源|可再生|清洁能源/.test(t)) return "新能源综合";
  return "能源政策";
}

// ============================================================
// 报告生成
// ============================================================

function renderReport(items, crawlTime, targetDate, errors, downloaded, stats) {
  const lines = [];

  // ===== 标题 =====
  lines.push(`☀️ 零碳能源行业早报 | ${targetDate}`);
  lines.push(`━━━━━━━━━━━━━━━━━━`);

  if (items.length === 0) {
    lines.push("今日结论：昨日各站均无与监控关键词匹配的新增内容。");
    lines.push("");
  } else {
    // ===== 6大板块精简渲染 =====

    // 分类辅助
    const copperItems = items.filter(it => it.source === "长江金属-铜价");
    const hubeiItems = items.filter(it =>
      it.source.startsWith("湖北") || it.title.includes("湖北")
    );
    const policyItems = items.filter(it =>
      it.source.startsWith("发改委") || it.source.startsWith("能源局") || it.source.startsWith("华中")
    );
    const mediaItems = items.filter(it =>
      it.source.startsWith("世纪") || it.source.startsWith("中国能源")
    );

    const usedKeys = new Set();

    // 每条2行：标题带链接 + 👉影响
    function renderItem(it, num) {
      const itemLines = [];
      itemLines.push(`${num}. [${it.title}](${it.link})（${sourceTag(it)}）`);
      const val = it.value || generateValue(it);
      itemLines.push(`   👉 ${val}`);
      return itemLines;
    }

    // 板块1：今日最重要（3条）
    const importantPool = [...policyItems, ...mediaItems].filter(it =>
      /通知|意见|办法|规划|方案|重磅|突破|首个|首次|创新高|新高|最大|GW|亿/.test(it.title)
    );
    const topItems = importantPool.length >= 3 ? importantPool.slice(0, 3) :
      [...importantPool, ...policyItems, ...mediaItems].slice(0, 3);

    if (topItems.length > 0) {
      lines.push("");
      lines.push(`🔴 一、今日最重要`);
      let num = 1;
      for (const it of topItems) {
        usedKeys.add(it.key);
        lines.push(...renderItem(it, num++));
      }
    }

    // 板块2：政策与行业（3条）
    const policyFiltered = policyItems.filter(it => !usedKeys.has(it.key)).slice(0, 3);
    if (policyFiltered.length > 0) {
      lines.push("");
      lines.push(`📋 二、政策与行业`);
      let num = 1;
      for (const it of policyFiltered) {
        usedKeys.add(it.key);
        lines.push(...renderItem(it, num++));
      }
    }

    // 板块3：湖北本地（2条）
    const hubeiFiltered = hubeiItems.filter(it => !usedKeys.has(it.key)).slice(0, 2);
    if (hubeiFiltered.length > 0) {
      lines.push("");
      lines.push(`📍 三、湖北本地`);
      let num = 1;
      for (const it of hubeiFiltered) {
        usedKeys.add(it.key);
        lines.push(...renderItem(it, num++));
      }
    }

    // 板块4：AI+电力（2条）
    const mediaFiltered = mediaItems.filter(it => !usedKeys.has(it.key)).slice(0, 2);
    if (mediaFiltered.length > 0) {
      lines.push("");
      lines.push(`⚡ 四、AI+电力`);
      let num = 1;
      for (const it of mediaFiltered) {
        usedKeys.add(it.key);
        lines.push(...renderItem(it, num++));
      }
    }

    // 板块5：铜价与材料
    if (copperItems.length > 0) {
      lines.push("");
      lines.push(`🔶 五、铜价与材料`);
      const it = copperItems[0];
      usedKeys.add(it.key);
      const pd = it.priceData || {};

      const parts = [];
      if (pd.avg) parts.push(`均价${pd.avg}`);
      if (pd.change) {
        const n = parseInt(pd.change);
        parts.push(`${n > 0 ? "↑" : n < 0 ? "↓" : "→"}${Math.abs(n)}`);
      }
      if (pd.min && pd.max) parts.push(`区间${pd.min}-${pd.max}`);
      if (parts.length > 0) {
        lines.push(`[铜价](${it.link})（元/吨）：${parts.join(" | ")}`);
      } else {
        lines.push(`[${it.title}](${it.link})`);
      }
      lines.push(`   👉 ${generateCopperJudgment(pd)}`);
    }

    // 板块6：机会提示
    lines.push("");
    lines.push(`💡 六、机会提示`);
    const hints = generateOpportunity(items);
    lines.push(`👉 ${hints.join("；")}`);
  }

  // ===== Footer =====
  lines.push("");
  lines.push(`━━━━━━━━━━━━━━━━━━`);
  lines.push(`⏰ ${formatDateTime(crawlTime)} | 来源：发改委/能源局/华中监管局/中国能源网/长江金属`);

  return lines.join("\n");
}

// 铜价判断语句生成
function generateCopperJudgment(pd) {
  if (!pd.avg) return "铜价数据获取中，建议关注长江有色金属网实时行情。";

  const avg = pd.avg;
  const change = pd.change ? parseInt(pd.change) : 0;

  if (change < -1000) {
    return `铜价大幅回落${Math.abs(change)}元/吨，短期恐慌情绪释放，下游可适时锁定采购成本。`;
  }
  if (change < -300) {
    return `铜价回调${Math.abs(change)}元/吨，采购窗口期显现，建议关注补库时机。`;
  }
  if (change > 1000) {
    return `铜价大幅上涨${change}元/吨，成本压力加大，建议加快在手订单锁价。`;
  }
  if (change > 300) {
    return `铜价上行${change}元/吨，注意原材料成本传导，必要时调整报价策略。`;
  }
  if (avg > 80000) {
    return `铜价高位运行（均价${avg}元/吨），建议合理控制库存，按需采购。`;
  }
  if (avg < 65000) {
    return `铜价处于相对低位（均价${avg}元/吨），可考虑战略性补库。`;
  }
  return `铜价平稳运行（均价${avg}元/吨），建议维持正常采购节奏。`;
}

// ============================================================
// 企业微信推送
// ============================================================

async function pushToWecom(report, webhookUrl) {
  // 截断到4096字节
  let content = report;
  const encoder = new TextEncoder();
  if (encoder.encode(content).length > 4000) {
    while (encoder.encode(content).length > 3900) {
      content = content.slice(0, -100);
    }
    content += "\n\n...（内容已截断，完整版请查看审核池）";
  }

  const body = JSON.stringify({
    msgtype: "markdown",
    markdown: { content },
  });

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!res.ok) throw new Error(`WeChat push failed: ${res.status}`);
  const json = await res.json();
  if (json.errcode !== 0) throw new Error(`WeChat error: ${json.errmsg}`);
  return json;
}

// ============================================================
// 日志
// ============================================================

function appendLog(items, crawlTime, targetDate, errors) {
  const lines = [`\n## ${targetDate} 早报`, ""];
  lines.push(`爬取时间：${formatDateTime(crawlTime)}`);
  if (items.length === 0) {
    lines.push("- 状态：无新增匹配内容");
  } else {
    lines.push(`- 状态：${items.length}条匹配`);
    for (const it of items) {
      lines.push(`- [${sourceTag(it)}] ${it.dateStr} | [${it.title}](${it.link})`);
    }
  }
  if (errors.length > 0) lines.push(`- 异常：${errors.join("；")}`);

  if (!fs.existsSync(LOG_PATH)) fs.writeFileSync(LOG_PATH, "# 能源行业早报日志\n", "utf8");
  fs.appendFileSync(LOG_PATH, lines.join("\n") + "\n", "utf8");
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const DRY_RUN = args.includes("--dry-run");
  const NO_DOWNLOAD = args.includes("--no-download");
  const wecomIdx = args.indexOf("--wecom-url");
  const WECOM_URL = wecomIdx >= 0 ? args[wecomIdx + 1] : process.env.WECOM_WEBHOOK_URL || null;
  // 支持指定目标日期（调试用）
  const dateIdx = args.indexOf("--date");

  const bjNow = getBeijingNow();
  const targetDate = dateIdx >= 0 ? args[dateIdx + 1] : getYesterdayDate(bjNow);

  console.error(`\n=== 能源行业早报系统 v3.1 ===`);
  console.error(`爬取时间：${formatDateTime(bjNow)}（北京时间）`);
  console.error(`目标日期：${targetDate}（昨日）`);
  console.error(`关键词：${KEYWORDS.length}个`);
  console.error(`模式：${DRY_RUN ? "DRY-RUN" : "正式运行"}`);
  console.error("");

  // 1. 创建审核池目录
  const auditDir = path.join(AUDIT_POOL_ROOT, targetDate);
  if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true });
  console.error(`审核池目录：${auditDir}`);
  console.error("");

  // 2. 抓取（只取targetDate的内容）
  const { allItems, errors, stats } = await crawlAllSites(targetDate);
  console.error(`\n昨日原始匹配：${allItems.length}条`);

  // 3. 去重
  const state = loadState();
  const matched = dedup(allItems, state);
  console.error(`去重+关键词后：${matched.length}条`);

  // 4. 获取摘要（抓详情页提取正文前200字）
  if (matched.length > 0) {
    console.error("\n获取文章摘要...");
    for (let i = 0; i < matched.length; i++) {
      const it = matched[i];
      console.error(`  [${i + 1}/${matched.length}] ${it.title.slice(0, 30)}...`);
      const result = await fetchArticleSummary(it);
      it.summary = result.summary;
      if (result.value) it.value = result.value;
      if (result.priceData) it.priceData = result.priceData;
    }
    console.error("摘要获取完成");
  }

  // 5. 下载附件到审核池
  let downloaded = [];
  if (!NO_DOWNLOAD && !DRY_RUN && matched.length > 0) {
    console.error("\n开始下载附件...");
    downloaded = await downloadAttachments(matched, auditDir);
    console.error(`下载完成：${downloaded.length}个文件`);
  }

  // 6. 生成报告
  const report = renderReport(matched, bjNow, targetDate, errors, downloaded, stats);

  // 保存到审核池
  const reportPath = path.join(auditDir, `早报_${targetDate}.md`);
  fs.writeFileSync(reportPath, report + "\n", "utf8");
  console.error(`\n报告已保存: ${reportPath}`);

  // 7. 推送企业微信
  if (WECOM_URL && !DRY_RUN) {
    try {
      await pushToWecom(report, WECOM_URL);
      console.error("[PUSH] 企业微信推送成功");
    } catch (err) {
      console.error(`[PUSH-FAIL] ${err.message}`);
      errors.push(`企业微信推送失败: ${err.message}`);
    }
  }

  // 8. 更新状态
  if (!DRY_RUN) {
    const newKeys = [...(state.reported_keys || []), ...matched.map(it => it.key)];
    // 14天窗口：只保留最近1000条哈希
    state.reported_keys = newKeys.slice(-1000);
    state.last_run = bjNow.toISOString();
    saveState(state);
    appendLog(matched, bjNow, targetDate, errors);
  }

  // 9. 输出
  process.stdout.write(report + "\n");
}

main().catch(err => {
  process.stderr.write(`早报系统失败: ${err.stack || err.message}\n`);
  process.exitCode = 1;
});
