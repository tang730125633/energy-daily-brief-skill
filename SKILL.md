# Skill: 能源行业日报 (energy-daily-brief)

## 概述

为戴总企业定制的能源行业自动日报系统。包含两大模块：
1. **行业资讯日报** — 从行业媒体和RSS源抓取能源行业动态
2. **三站政策监控** — 专项监控发改委、能源局、华中监管局三个政府网站的政策更新

## 模块一：行业资讯日报

### 步骤 1：执行日报生成脚本

```bash
node ~/.openclaw/workspace/projects/能源行业日报/generate_energy_daily_brief.cjs --dry-run
```

检查输出：
- 如果有数据 → 进入步骤 2
- 如果"今日无新增" → 用 `web_fetch` 手动补充

### 步骤 2：多源抓取（必须执行，不论脚本是否有数据）

**每次必须全部抓取以下 5 个来源，不得因"脚本有数据"而跳过此步骤：**

**戴总认证信息源（2026-04-08 验证通过，以此为准）：**
```
web_fetch https://www.bjx.com.cn/           # 1. 北极星电力网 ✅ 日更20+
web_fetch https://www.ne21.com/             # 2. 世纪新能源网 ✅ 日更10+
web_fetch https://www.cpnn.com.cn/          # 3. 中国能源新闻网 ✅ 日更10+
web_fetch https://www.esplaza.com.cn/       # 4. IESPlaza综合能源服务网 ✅ 日更5+
web_fetch https://www.nea.gov.cn/           # 5. 国家能源局 ✅ 周更3-5
```

重点关注：光伏、风电、储能、氢能、核电、电价、电力市场、碳交易、政策发布、项目招标、装机并网、虚拟电厂、源网荷储、绿电直连、数字化

**内容量要求：最终日报必须包含至少 8 条不重复的有效新闻条目。若不足 8 条，继续抓取剩余来源直到满足要求。**

### 步骤 3：整理日报格式

```
☀️ 零碳能源行业早报 | YYYY-MM-DD

一、今日最重要
（2条当日最有影响力的新闻，每条含标题+来源+日期+链接+2句话摘要）

二、政策与行业
（政策发布、行业规划、市场动态，每条含标题+来源+日期+链接+摘要）

三、湖北本地
（湖北省内电力/能源相关新闻。如无则写"暂无湖北本地相关新闻，持续监控中。"）

四、AI+电力
（AI与电力/能源结合的新闻，如数字化、智能调度、算电协同等。如无则写"暂无相关动态。"）

五、铜价走势
（铜期货/现货价格走势。早报发送时间为10:30，若尚无数据写"暂无今日数据（通常10:30后更新）"）

六、重点机会
（基于今日新闻提炼2-3条投资/业务机会提示，用🔸标记）

📊 来源：北极星电力网✅ 世纪新能源网✅ 中国能源新闻网✅ IESPlaza✅ 国家能源局✅
📎 完整版归档链接
```

**六大板块规则：**
- 每个板块必须存在，没有内容要注明"暂无"
- 板块一"今日最重要"固定2条，是当天最有影响力的
- 板块六"重点机会"是编辑视角的机会提炼，不是新闻搬运
- 每条新闻必须有：标题+来源+日期+链接+摘要（≥2句话）
- 总条数 ≥ 8 条

### 步骤 4：推送到企业微信

```bash
node ~/.openclaw/workspace/projects/能源行业日报/generate_energy_daily_brief.cjs --wecom-url "WEBHOOK_URL"
```

### 步骤 5：归档与记录日志

**5a. 按日期独立归档（必须执行）：**
将完整日报内容写入：
```
~/.openclaw/workspace/projects/能源行业日报/archive/YYYY-MM-DD.md
```
文件名为当天北京时间日期，如 `2026-04-07.md`。如文件已存在则覆盖。

**5b. 追加日志摘要：**
追加到 `~/.openclaw/workspace/projects/能源行业日报/report_log.md`
格式：`[YYYY-MM-DD HH:mm] 共 N 条，来源：xxx, xxx`

---

## 模块二：三站政策监控

### 监控目标

| 站点 | URL | 监控栏目 |
|------|-----|---------|
| 国家发改委 | https://www.ndrc.gov.cn/ | 通知、规范性文件、令、公告 |
| 国家能源局 | https://www.nea.gov.cn/ | 首页、新能源司、电力司、规划司 |
| 华中监管局 | https://hzj.nea.gov.cn/ | 监管动态、通知公告、重要信息、时政要闻 |

### 监控关键词（37个）

电网、能源、电力、电价、光伏、容量、绿电直连、零碳、低碳、新能源、分布式、集中式、用电、供电、发电、储能、氢能、充电桩、碳中和、碳达峰、碳、风电、核电、水电、电池、特高压、可再生、清洁能源、绿证、绿电、电力市场、输配电、售电、上网电价、并网、消纳、装机

### 执行步骤

#### 步骤 1：运行三站监控脚本

```bash
node ~/.openclaw/workspace/projects/能源行业日报/gov_energy_monitor.cjs --dry-run --no-download
```

查看输出中每个站点的抓取数量和关键词匹配结果。

#### 步骤 2：正式运行（带附件下载）

```bash
node ~/.openclaw/workspace/projects/能源行业日报/gov_energy_monitor.cjs
```

这会：
- 抓取12个页面的文章列表
- 按37个关键词过滤
- 14天窗口去重
- 自动下载PDF/DOC/XLS附件到 `downloads/` 目录
- 生成报告到 `gov_latest_report.md`
- 更新状态到 `gov_state.json`
- 追加日志到 `gov_report_log.md`

#### 步骤 3：检查并补充

如果某个站点抓取失败（FAIL），用 `web_fetch` 手动补充：
```
web_fetch https://www.ndrc.gov.cn/xxgk/zcfb/tz/
web_fetch https://www.nea.gov.cn/
web_fetch https://hzj.nea.gov.cn/dtyw/jgdt/
```

#### 步骤 4：合并输出

将三站监控结果与行业日报合并，生成完整日报后推送企业微信。

---

## 去重规则

- 发送前读取 `report_log.md` 和 `gov_report_log.md`
- 14天窗口去重：已发过的条目不再重复
- 同一事件有新进展 → 标注"旧事项新进展"
- 无日期的条目保守保留

## 分类标签

按内容自动分类：光伏、风电、储能、氢能、核电、电网、充换电、碳与绿电、电价与市场、新能源综合、能源政策

## 定时执行

此 Skill 已配置 cron 定时任务，每天北京时间 08:30 自动触发。

## 注意事项

1. **最低内容量**：每份日报必须包含 ≥8 条不重复有效新闻，不足则继续抓取
2. **禁止偷懒**：不得以"脚本已有数据"为由跳过多源抓取步骤
3. **每条必须有实质内容**：标题 + 来源 + 日期 + 链接 + 摘要（至少 2 句话）
4. **禁止格式凑数**：不得只写标题不写摘要，不得用"详见原文"替代摘要
5. 优先使用官方一手来源（发改委/能源局/国网/南网）
6. 推送前必须自查：有没有重复？有没有日期？有没有链接？有没有摘要？
7. **必须归档**：每次执行后将完整日报存入 `archive/YYYY-MM-DD.md`
8. 企业微信 markdown 有 4096 字节限制，超长时截断并注明"完整版见归档"
9. 政府网站经常变动，如果出现 404/403 属正常，切换到备用来源
10. 下载的附件保存在 `downloads/` 目录，文件名带日期前缀

## 相关文件

- 行业日报脚本：`~/.openclaw/workspace/projects/能源行业日报/generate_energy_daily_brief.cjs`
- 三站监控脚本：`~/.openclaw/workspace/projects/能源行业日报/gov_energy_monitor.cjs`
- 行业日报最新报告：`~/.openclaw/workspace/projects/能源行业日报/latest_report.md`
- 三站监控最新报告：`~/.openclaw/workspace/projects/能源行业日报/gov_latest_report.md`
- 行业日报发送记录：`~/.openclaw/workspace/projects/能源行业日报/report_log.md`
- 三站监控发送记录：`~/.openclaw/workspace/projects/能源行业日报/gov_report_log.md`
- 三站监控状态：`~/.openclaw/workspace/projects/能源行业日报/gov_state.json`
- 下载附件目录：`~/.openclaw/workspace/projects/能源行业日报/downloads/`
