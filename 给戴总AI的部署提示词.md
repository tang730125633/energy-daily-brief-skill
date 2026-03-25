# 零碳能源行业早报系统 v3.1 - 部署指令

## GitHub 仓库

https://github.com/tang730125633/energy-daily-brief-skill

---

## 完整部署提示词（直接发给 AI 执行）

请把以下内容完整发送给戴总电脑上的 AI 助手（Claude Code / OpenClaw 等）：

---

你好，请帮我部署**零碳能源行业早报系统**。这是一个 Node.js 脚本，每天自动爬取7个能源网站，生成精简早报并推送企业微信。

请严格按以下步骤执行，每完成一步告诉我结果：

### 第一步：下载项目

```bash
git clone https://github.com/tang730125633/energy-daily-brief-skill.git ~/.openclaw/workspace/projects/能源行业日报
```

如果已存在该目录，先更新：

```bash
cd ~/.openclaw/workspace/projects/能源行业日报 && git pull
```

### 第二步：测试运行

```bash
cd ~/.openclaw/workspace/projects/能源行业日报
node energy_morning_brief.cjs --dry-run --no-download
```

执行后告诉我：
1. 7个站点各抓到多少条？
2. 去重+关键词过滤后剩几条？
3. 6大板块是否正常显示？（一、今日最重要 / 二、政策与行业 / 三、湖北本地 / 四、AI+电力 / 五、铜价与材料 / 六、重点机会提示）
4. 湖北省能源局如果显示"412"是正常的（该站有WAF，脚本会自动跳过）

### 第三步：生成完整早报

```bash
node energy_morning_brief.cjs --no-download
```

这会生成完整早报并保存到 `审核池/YYYY-MM-DD/早报_YYYY-MM-DD.md`

### 第四步：配置企业微信推送

```bash
node energy_morning_brief.cjs --wecom-url "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的KEY"
```

### 第五步：配置每天8点定时任务

用 crontab 或 launchd 设置每天早上8点运行：

```bash
# 编辑crontab
crontab -e

# 添加这一行（每天8:00北京时间执行）
0 8 * * * cd ~/.openclaw/workspace/projects/能源行业日报 && node energy_morning_brief.cjs --wecom-url "你的WEBHOOK地址" >> cron.log 2>&1
```

### 完成后请汇报

1. 7个站点的抓取结果
2. 生成的早报内容样本（截前几行给我看）
3. 企业微信推送是否成功

---

## 早报格式说明（v3.1 精简版）

早报共6大板块，每条精简为：**【标题】→ 100字摘要 → 👉影响 → 🔗来源链接**

```
**零碳能源行业早报 | 2026-03-24**

**一、今日最重要 (3条)**
**1. 【标题】**
摘要内容（100字以内）...
👉 影响/价值分析
🔗 来源｜查看原文

**二、政策与行业 (3条)**
...

**三、湖北本地 (2条)**
...

**四、AI+电力 (2条)**
...

**五、铜价与材料**
| 指标 | 数据 |
|------|------|
| 1#铜均价 | **xxxxx元/吨** |
| 涨跌 | ↑/↓ xxx元/吨 |
| 价格区间 | xxxxx-xxxxx元/吨 |
👉 铜价判断和采购建议

**六、重点机会提示**
👉 **本周关注：**
1. 具体建议1
2. 具体建议2

---
⏰ 早报完成时间：HH:MM
📰 信息来源：国家发改委、国家能源局...
```

## 7个数据来源

| 站点 | 说明 |
|------|------|
| 国家发改委 (ndrc.gov.cn) | 4个栏目：通知/规范性文件/令/公告 |
| 国家能源局 (nea.gov.cn) | 4个栏目：首页/新能源司/电力司/规划司 |
| 华中监管局 (hzj.nea.gov.cn) | 4个栏目：监管动态/通知公告/重要信息/时政要闻 |
| 湖北省能源局 (fgw.hubei.gov.cn) | 4个栏目 ⚠️有WAF防护，可能抓取失败 |
| 世纪新能源网 (ne21.com) | 光伏风电储能氢能资讯 |
| 中国能源网 (china5e.com) | 综合能源新闻 |
| 长江有色金属网 (ccmn.cn) | 长江现货铜价 |

## 常用命令

```bash
# 测试运行（不推送、不下载附件）
node energy_morning_brief.cjs --dry-run --no-download

# 指定日期测试
node energy_morning_brief.cjs --date 2026-03-24 --dry-run --no-download

# 正式运行（生成早报+下载附件）
node energy_morning_brief.cjs

# 正式运行+推送企业微信
node energy_morning_brief.cjs --wecom-url "WEBHOOK_URL"
```

## 注意事项

- 需要 Node.js >= 18（支持原生 fetch）
- 湖北站有WAF，脚本会自动跳过，这是正常的
- 企业微信 markdown 有4KB限制，脚本自动截断
- SHA256去重，14天窗口，不会重复推送
- 铜价工作日10点更新，早报用前一交易日价格
