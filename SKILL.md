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

**每次必须至少抓取以下 7 个来源中的 5 个，不得因"脚本有数据"而跳过此步骤：**

**戴总认证信息源（2026-04-08 更新，以此为准）：**
```
web_fetch https://www.bjx.com.cn/           # 1. 北极星电力网
web_fetch https://www.in-en.com/            # 2. 国际能源网
web_fetch https://www.ne21.com/             # 3. 世纪新能源网
web_fetch http://mm.chinapower.com.cn/      # 4. 中国电力网
web_fetch https://www.cpnn.com.cn/          # 5. 中国能源新闻网
web_fetch https://www.esplaza.com.cn/       # 6. IESPlaza综合能源服务网
web_fetch https://www.nea.gov.cn/           # 7. 国家能源局
```

重点关注：光伏、风电、储能、氢能、核电、电价、电力市场、碳交易、政策发布、项目招标、装机并网、虚拟电厂、源网荷储、绿电直连、数字化

**内容量要求：最终日报必须包含至少 8 条不重复的有效新闻条目。若不足 8 条，继续抓取剩余来源直到满足要求。**

### 步骤 3：整理日报格式

```
能源行业日报 | YYYY-MM-DD
验证时间：YYYY-MM-DD HH:mm（北京时间）

今日结论：
一句话概括。

今日新增事项：

【分类标签】
1. 标题
   来源：xxx
   日期：YYYY-MM-DD
   链接：URL
   价值：为什么值得看
   摘要：简要内容

风险与不确定性：
如有则写明，无则写"无"。
```

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
