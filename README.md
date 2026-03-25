# 零碳能源行业早报系统 v3.1

每日自动爬取7个能源行业网站，按37个关键词过滤，生成6大板块早报，推送至企业微信。

## 数据来源

| 站点 | 说明 |
|------|------|
| 国家发改委 | 通知、规范性文件、令、公告 |
| 国家能源局 | 首页、新能源司、电力司、规划司 |
| 华中监管局 | 监管动态、通知公告、重要信息 |
| 湖北省能源局 | 通知公告、新能源处、电力监管、能源规划 |
| 世纪新能源网 | 光伏风电储能氢能行业资讯 |
| 中国能源网 | 综合能源新闻 |
| 长江有色金属网 | 长江现货铜价 |

## 早报格式（6大板块）

一、今日最重要 (3条) → 二、政策与行业 (3条) → 三、湖北本地 (2条) → 四、AI+电力 (2条) → 五、铜价与材料 (表格) → 六、重点机会提示

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
