# 零碳能源行业早报系统 v4.0

每日 10:30（北京时间）自动抓取 15+ 能源行业网站，按关键词过滤，生成6大板块早报，推送至企业微信。

> **v4.0 更新（2026-04-07）**：扩充来源至15个网站，新增多源必抓规则，最低内容量≥8条，新增按日期独立归档。

## 数据来源

### 脚本内置来源（自动抓取）

| 站点 | 说明 |
|------|------|
| 国家发改委 | 通知、规范性文件、令、公告 |
| 国家能源局 | 首页、新能源司、电力司、规划司 |
| 华中监管局 | 监管动态、通知公告、重要信息 |
| 湖北省能源局 | 通知公告、新能源处、电力监管、能源规划 |
| 世纪新能源网 | 光伏风电储能氢能行业资讯 |
| 中国能源网 | 综合能源新闻 |
| 长江有色金属网 | 长江现货铜价（10:30后更新最准确） |

### AI 补充来源（每日必抓，≥5个）

| 站点 | URL | 特色 |
|------|-----|------|
| 北极星电力网 | bjx.com.cn | 电力垂直龙头，日更数百条 |
| 国际能源网 | in-en.com | 全能源领域，日更上千条 |
| 中国电力网 | chinapower.com.cn | 能源局主管，官方权威 |
| 电网头条 | cpnnews.com.cn | 国家电网官方媒体 |
| 南方电网报 | csgnews.com.cn | 南方电网官方媒体 |
| IESPlaza综合能源 | iesplaza.com | 虚拟电厂/源网荷储专精 |
| 电力信息化传媒 | epiao.com.cn | 电力AI/数字化专精 |
| 中国新能源网 | newenergy.org.cn | 行业协会数据权威 |

## 早报格式（6大板块）

一、今日最重要 (≥3条) → 二、政策与行业 (≥3条) → 三、湖北本地 (≥2条) → 四、AI+电力 (≥2条) → 五、铜价与材料 (表格) → 六、重点机会提示

**内容量要求：每份早报合计 ≥8 条有效新闻，每条必须有标题+来源+日期+链接+摘要（≥2句话）。**

## 快速使用

```bash
# 前置条件：Node.js >= 18

# 测试运行（不推送）
node energy_morning_brief.cjs --dry-run --no-download

# 指定日期测试
node energy_morning_brief.cjs --date 2026-03-24 --dry-run --no-download

# 正式运行 + 企业微信推送
node energy_morning_brief.cjs --wecom-url "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY"
```

## 文件说明

```
energy_morning_brief.cjs      # 主脚本（早报系统 v3.1）
industry_standards_crawler.cjs # 行业标准检索模块（学兔兔+国标平台）
给戴总AI的部署提示词.md         # 部署说明
```

运行时自动生成：

```
morning_state.json             # 去重状态（SHA256哈希，14天窗口）
morning_report_log.md          # 发送日志
report_log.md                  # AI补充抓取日志
archive/YYYY-MM-DD.md          # 按日期独立归档（v4.0新增）
审核池/YYYY-MM-DD/             # 按日期归档的早报和附件
```

## 核心特性

- 37个能源关键词过滤
- SHA256哈希去重（14天滚动窗口）
- 铜价表格展示 + 智能判断建议
- 自动生成机会提示
- 企业微信 markdown 推送（4KB自动截断）
- 湖北WAF自动检测降级

## 许可

MIT License
