# LoseWeight

个人 AI 减脂助手：拍一顿 → AI 识别 → 确认 → 自动统计。

核心原则：**AI 负责识别和建议，程序和数据库负责数据和计算。** 统计只读用户确认过的值；
AI 的原始估算只留档；聊天时由程序把算好的真实数据交给 AI，AI 不靠聊天记录回忆。

## 技术栈

Next.js (App Router) + TypeScript · SQLite (Drizzle ORM) · Tailwind · OpenAI API · Caddy · systemd

## 项目结构

```
src/
  app/            页面和 API 路由
    (app)/        登录后的页面：首页、某一天、确认/编辑饮食、体重、趋势、聊天、设置
    api/          所有接口，统一经过 lib/http.ts（登录、来源、输入校验、错误处理）
  components/     界面组件
  db/schema.ts    数据库表结构（唯一来源）
  services/       业务逻辑：meals / metrics / profile / snapshot / assistant
  lib/            通用工具：时间与时区、营养与体重计算、认证、图片、存储
  lib/ai/         模型调用：client（唯一出口）、analyze-meal（识别）、advisor（建议与聊天）
drizzle/          数据库迁移文件（自动生成，需提交）
scripts/          create-user / migrate / maintenance
deploy/           systemd、Caddy 配置，setup.sh 和 deploy.sh
tests/            单元与集成测试
```

关键数据表：`meals`（一顿饭，`status=draft` 不计入统计，`ai_estimate` 保存 AI 原始结果）、
`meal_items`（用户确认的明细，统计只读这里）、`body_metrics`、`goal_history`、`chat_messages`。
所有业务表都带 `user_id`。

## 本地开发

```bash
cp .env.example .env.local   # 填入 OPENAI_API_KEY，DATA_DIR 改成 ./data
npm install
npm run user:create -- <用户名> [显示名]   # 打印随机密码
npm run dev
```

```bash
npm test            # 测试
npm run typecheck   # 类型检查
```

## 环境变量

生产环境放在 `/etc/loseweight/env`（权限 600，不进 Git）。

| 变量 | 说明 |
|---|---|
| `OPENAI_API_KEY` | OpenAI 密钥，只在服务端使用 |
| `OPENAI_MODEL` | 识图和聊天使用的模型，默认 `gpt-6-astra` |
| `OPENAI_TRANSCRIBE_MODEL` | 语音转文字模型，默认 `gpt-4o-transcribe` |
| `DATA_DIR` | 数据目录（数据库、图片、备份），生产为 `/var/lib/loseweight` |
| `APP_ORIGIN` | 对外地址，如 `https://lw.example.com`，用于校验请求来源 |
| `IMAGE_RETENTION_DAYS` | 原图保留天数，默认 90，之后只留缩略图 |
| `AI_DAILY_LIMIT` | 每个用户每天 AI 调用上限，默认 200 |

## 部署

全新 Ubuntu 24.04：

```bash
git clone <repo> /opt/loseweight && cd /opt/loseweight
sudo deploy/setup.sh lw.example.com    # 装环境、建用户和目录、配置 Caddy 与 systemd，可重复执行
sudo nano /etc/loseweight/env          # 填 OPENAI_API_KEY
sudo deploy/deploy.sh                  # 安装依赖、测试、构建、重启、健康检查
```

之后每次改完代码只需要 `sudo deploy/deploy.sh`。

- 应用以 `loseweight` 用户运行，只监听 `127.0.0.1:3000`，由 Caddy 提供 HTTPS。
- 服务器重启后 `loseweight`、`caddy` 和每日维护定时器都会自动启动。
- 域名经过 Cloudflare 代理时，Cloudflare 的 SSL 模式应为 Full (strict)。

## 数据库迁移

1. 修改 `src/db/schema.ts`
2. `npm run db:generate` 生成迁移文件到 `drizzle/`，检查后提交
3. 部署。应用启动时会自动执行未应用的迁移（也可手动 `npm run db:migrate`）

## 拍照记录的流程

1. 手机端把照片缩到最长边 1600px 后上传。
2. 服务端校验并重新编码图片（去 EXIF），保存原图和缩略图。
3. 调用模型，按 JSON Schema 返回：每项食物（名称、数量、重量、热量、三大营养素、置信度、是否个人独食）、
   整桌热量范围、人数提示、最多 2 个追问。
4. 程序校验模型输出：数值范围、总热量由程序相加、范围必须包住总数、三大营养素与热量自相矛盾的项目降为“不太确定”。
5. 存为草稿（`status=draft`，不计入统计），跳到确认页。
6. 用户可回答追问（重新估算一次）、改任何数值、选择几人分食，点「确认记录」后才计入当天。

语音记录走同一条路：浏览器录音（最长 60 秒）→ 服务端转文字（`OPENAI_TRANSCRIBE_MODEL`）→ 当作文字描述交给同一个识别流程。
录音本身不保存，转出的文字随 AI 原始估算存档并显示在确认页。用户说出的人数和餐次会作为确认页的默认值。

多人分食：明细按整桌保存，`meals.share_people` 记人数；合吃的项目计入 1/N，
`meal_items.personal=1` 的项目（如自己那碗饭）全额计入。分摊只由程序计算。

修正（没吃完）：`meal_items.eaten_fraction` 记录每样食物实际吃掉的比例，明细保留原始份量，
计入统计时 × 比例。快捷按钮由程序直接换算；语音或文字经 `/api/meals/[id]/adjust` 交给 AI
翻译成每样食物的比例，只回填到编辑页，用户点「保存修改」才生效。

## 提示词

所有提示词集中在 `src/lib/ai/prompts.ts`，文件开头写明了原则。修改识别提示词后要升 `MEAL_PROMPT_VERSION`，
版本号会随 AI 原始估算一起存档。交给聊天模型的用户数据由 `src/services/snapshot.ts` 生成。

## 目标推荐

`src/lib/goals.ts`（纯计算，不调用 AI）：热量 = 基础代谢 × 活动系数 − 500，不低于基础代谢和 1200；
蛋白质 = 去脂体重 × 2.0 g（无体脂率时按目标体重 × 1.6 g）。「我的」页展示推荐值和依据，用户点「一键更新目标」才会采用。

## 身体数据

主要入口是上传体脂秤报告截图：AI 只负责抄录图上的数字，程序做范围检查和交叉核对
（体重×体脂率≈脂肪量 等），然后直接入库。以报告上的测量日期为准，同一天重复上传会覆盖。
截图本身不保存。核心指标是 `body_metrics` 的独立列，其余指标存在 `extra`（JSON）里。

## 图片

上传后重新编码为 WebP（最长边 1600px，去掉 EXIF），另存 360px 缩略图，存放在
`$DATA_DIR/uploads/u<用户id>/<年>/<月>/`，数据库只存路径。图片通过需要登录的接口读取。
所有读写经过 `src/lib/storage.ts` 的接口，将来换对象存储只需替换这一处。

## 常用维护命令

```bash
systemctl status loseweight               # 运行状态
journalctl -u loseweight -f               # 实时日志（JSON 行）
journalctl -u loseweight --since today | grep '"level":"error"'
systemctl restart loseweight              # 重启
journalctl -u loseweight-maintenance -n 20   # 每日维护（04:10）的结果
ls /var/lib/loseweight/backups            # 数据库备份，保留 14 天
```

以下命令需要以服务用户身份并带上环境变量执行：

```bash
run() { sudo -u loseweight env $(grep -v '^#' /etc/loseweight/env | xargs) "$@"; }
cd /opt/loseweight
run npm run user:create -- <用户名>        # 新建用户；用户已存在则重置密码
run npm run maintenance                    # 立即备份并清理
```

恢复备份：

```bash
systemctl stop loseweight
cp /var/lib/loseweight/backups/loseweight-YYYY-MM-DD.db /var/lib/loseweight/loseweight.db
rm -f /var/lib/loseweight/loseweight.db-wal /var/lib/loseweight/loseweight.db-shm
chown loseweight:loseweight /var/lib/loseweight/loseweight.db
systemctl start loseweight
```

备份目前和数据在同一块硬盘上，防的是误操作而不是硬盘损坏。
