# 能源行业日报系统 v2.2 - 部署指令

## GitHub 仓库

https://github.com/tang730125633/energy-daily-brief-skill

---

## 完整部署提示词（直接发给 AI 执行）

请把以下内容完整发送给戴总电脑上的 OpenClaw 或 Claude Code：

---

你好，我现在要教你部署一个新的技能：**能源行业早报 + 行业标准检索系统**。

系统包含三大模块：
1. **能源早报** (`energy_morning_brief.cjs`) — 每日从5个政府/行业网站抓取昨日能源资讯，生成带摘要、价值分析、真实链接的早报
2. **行业标准检索** (`industry_standards_crawler.cjs`) — 从学兔兔和国标平台检索能源相关标准和规范
3. **三站政策监控** (`gov_energy_monitor.cjs`) — 14天滚动窗口政策监控（可选）

请严格按以下步骤执行，每完成一步告诉我结果：

### 第一步：下载项目

```bash
git clone https://github.com/tang730125633/energy-daily-brief-skill.git ~/.openclaw/workspace/projects/能源行业日报
```

如果已存在该目录，先更新：

```bash
cd ~/.openclaw/workspace/projects/能源行业日报 && git pull
```

### 第二步：测试早报系统（核心功能）

```bash
node ~/.openclaw/workspace/projects/能源行业日报/energy_morning_brief.cjs --date 2026-03-24 --dry-run --no-download
```

执行后告诉我：
1. 5个站点（发改委/能源局/华中监管局/湖北省能源局/长江金属）各抓到多少条？
2. 去重+关键词过滤后剩几条？
3. 摘要和价值分析是否正常生成？
4. 湖北省能源局如果显示"412 Precondition Failed"是正常的（该站有WAF防护，脚本会自动跳过并标注）

### 第三步：测试行业标准检索

```bash
node ~/.openclaw/workspace/projects/能源行业日报/industry_standards_crawler.cjs --dry-run
```

执行后告诉我：
1. 学兔兔匹配了多少条标准？
2. 国标平台搜索是否成功？

### 第四步：生成一份完整早报

```bash
node ~/.openclaw/workspace/projects/能源行业日报/energy_morning_brief.cjs --no-download
```

这会：
- 抓取昨日所有能源资讯
- 获取每篇文章的摘要和价值分析
- 按类别（铜价行情/电价与市场/电网/光伏/储能...）组织内容
- 保存到 `审核池/YYYY-MM-DD/早报_YYYY-MM-DD.md`

### 第五步：指定日期生成（核心突破功能）

```bash
node ~/.openclaw/workspace/projects/能源行业日报/energy_morning_brief.cjs --date 2026-03-20 --dry-run --no-download
```

可以指定任意日期生成该日的早报内容。

### 第六步：配置定时任务

每天早上 8:00 自动生成早报并推送企业微信：

```bash
# 在 cron 或 OpenClaw 定时任务中添加：
node ~/.openclaw/workspace/projects/能源行业日报/energy_morning_brief.cjs --wecom-url "企业微信WEBHOOK地址"
```

标准检索可以每周运行一次（带下载功能）：

```bash
node ~/.openclaw/workspace/projects/能源行业日报/industry_standards_crawler.cjs --download
```

### 第七步：配置企业微信推送

如果已有企业微信 Webhook URL：

```bash
node ~/.openclaw/workspace/projects/能源行业日报/energy_morning_brief.cjs --wecom-url "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY"
```

### 完成后

请汇报：
1. 早报系统5个站点的抓取结果
2. 行业标准检索是否正常
3. 生成的早报内容样本
4. 企业微信推送是否成功

---

## 系统架构说明

### 早报数据来源（5个站点）

| 站点 | URL | 说明 |
|------|-----|------|
| 国家发改委 | ndrc.gov.cn | 4个栏目（通知/规范性文件/令/公告） |
| 国家能源局 | nea.gov.cn | 4个栏目（首页/新能源司/电力司/规划司） |
| 华中监管局 | hzj.nea.gov.cn | 4个栏目（监管动态/通知公告/重要信息/时政要闻） |
| 湖北省能源局 | fgw.hubei.gov.cn | 4个栏目（通知公告/新能源处/电力监管/能源规划）⚠️有WAF |
| 长江金属铜价 | copper.ccmn.cn | 铜价行情（工作日10点更新，早报用昨日价格） |

### 行业标准数据来源（3个网站）

| 站点 | URL | 说明 |
|------|-----|------|
| 学兔兔(标准分享网) | bzfxw.com | 能源/电力分类标准，可下载文件 |
| 全国标准信息公共服务平台 | std.samr.gov.cn | 国家标准查询，支持关键词搜索 |
| 百度小程序-标准规范集 | vmx4nq.smartapps.baidu.com | ⚠️AI聊天助手，需手动在百度App中使用 |

### 37个监控关键词

电网、能源、电力、电价、光伏、容量、绿电直连、零碳、低碳、新能源、分布式、集中式、用电、供电、发电、储能、氢能、充电桩、碳中和、碳达峰、碳、风电、核电、水电、电池、特高压、可再生、清洁能源、绿证、绿电、电力市场、输配电、售电、上网电价、并网、消纳、装机

## 注意事项

- 湖北省能源局(fgw.hubei.gov.cn)有WAF防护，HTTP请求可能返回412，脚本会自动跳过并在异常信息中标注。如该站重要内容需要，可使用 `web_fetch` 手动补充
- 铜价在工作日上午10点更新，所以8点早报使用的是前一交易日的铜价
- 企业微信 markdown 有 4096 字节限制，脚本会自动截断
- SHA256哈希去重，14天滚动窗口，绝不重复推送
- 每篇文章都会抓取详情页提取200字摘要 + 智能价值分析
- 所有PDF/DOC附件自动下载到 `审核池/日期/` 目录
