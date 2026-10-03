AI软件赛道 - AI终身合伙人·长安八业 - ai终身合伙人
面向西安八个行业的 AI 工作任务展示与文件处理项目。把重复工作拆成有输入、交付产物、接收岗位和验收标准的 Skills，再通过岗位 Agent 与协作规则组织工作。

**体验网站：** [xian.wutiantian.cn](https://xian.wutiantian.cn/)

## 当前版本能做什么

- 三层浏览体验：视频首页与八业轮播、3D 冰屋行业介绍、双图光圈行业详情。
- 暖白 Skills 阅读区：搜索、模块筛选、默认展开的工作说明，以及鼠标拖动、按钮和方向键翻页。
- 1066 项技能规格，包含建议上班时间、日常工作、推送对象、产物、量化指标、公式、样本与证据要求。
- 64 个规划岗位 Agent、24 条规划协作流程、16 条 Harness 规则，可查看关联关系。
- 8 条实际可运行的文件流程：使用示例或上传 CSV/JSON，生成业务产物和复核任务；支持运行记录、下载、人工确认/退回、取消及重试。
- 完整 Excel、16 页比赛 PPT/PDF、一页 A4 演讲稿，以及用户提供的 31 页药物研发资料阅读器。

**状态说明：** 1066 项是规划技能规格，不代表 1066 个执行器已接入。目录中的班次和指标是建议试运行标准；没有绑定真实业务连接器，也没有自动向外部岗位发送消息。8 条文件流程的已记录示例采用合成数据和规则/模板执行，外部模型调用关闭，不属于真实企业业绩。

## 八个行业

| 行业 | Skills | 工作切入点 | 典型交付与接收岗位 |
|---|---:|---|---|
| 药物研发 | 120 | 候选证据分散、实验状态与安全信号遗漏 | 候选证据矩阵，交药理/实验负责人 |
| 智能制造 | 136 | 质检台账汇总与异常处置衔接 | 缺陷分布及工单草稿，交质量工程师 |
| 电商助企 | 162 | 多平台商品资料重复整理、库存口径核对 | 商品草稿与库存异常清单，交电商运营 |
| 小店经营 | 128 | 订单、收付款和经营记录反复对账 | 收款/待收清单，交店主或经营负责人 |
| 文旅服务 | 167 | 景点信息零散、路线时段冲突 | 行程草案与待核项，交游客服务负责人 |
| 就业技能 | 112 | 能力与目标岗位之间缺少具体练习路径 | 技能差距与练习计划，交培训或就业服务人员 |
| 政务便民 | 117 | 指南版本、材料缺件和交接信息整理 | 材料对照/缺件清单，交授权业务专员 |
| 乡村产业 | 124 | 批次、品级与可售库存信息整理 | 农产品批次与库存表，交合作社负责人 |
| **合计** | **1066** | | |

八业是本项目的服务分类，不能直接当作互斥的统计产业分类。

## Skills、Agent 与 Harness

- **Skill** 定义一项具体工作：输入、处理步骤、产物和验收方法。
- **Agent** 承担岗位任务：按照服务时间和触发条件调用相应 Skill。
- **Harness** 规定运行约束：权限、输入校验、日志、人工审核、异常交接与重试边界。

“黑灯办公室”的建设目标是让资料整理等重复工作持续交付给负责岗位。当前仓库提供规划规格与文件流程；实际排班、接收名单、外部模型和业务系统需要在授权后逐项接入。行政决定、临床判断和其它关键业务结论由专业或授权人员确认。

## 源码与素材下载

**首选下载完整源码包：** 请打开本仓库 [Releases](https://github.com/bincode-model/xian-ai-partner/releases)，下载 `xian-ai-partner-source.zip` 并直接解压。它包含全部 300 个源码、说明与素材文件，解压后即可按下方步骤运行。

**可选备用：** 如果完整 ZIP 下载不稳定，可改用 `xian-ai-partner-source.zip.001` 至 `.014` 分卷。请把 **全部 14 卷**、`restore.py` 和 `parts-manifest.json` 下载到同一个文件夹。进入这个文件夹，在终端执行：

```bash
python3 restore.py
```

脚本按它所在的文件夹读取分卷和清单，逐卷校验 SHA-256，在同一文件夹组装 `xian-ai-partner-source.zip`，校验完整包 SHA-256 与 ZIP CRC，再解压到该文件夹下的 `restored/xian-ai-partner/`。进入 `restored/xian-ai-partner/` 后，按下方“本地运行”步骤安装和启动。分卷不能分别解压；缺少任何一卷都不能还原。

完整源码包 SHA-256：`cd3202f69e7f076c4cb01fe254bfb31902b9af9a442087b93854afd5762928e4`。

GitHub 仓库页面提供可浏览的 51 个核心源码、配置、测试与项目说明文件。通过 Git clone 或 GitHub 的 Download ZIP 获取的仓库，以及 Release 中的 `xian-ai-partner-core-source.zip`，均不包含 `public/` 素材目录；视频、3D 模型与贴图、声音、行业配图、Skills 数据及 Excel、PPT/PDF 均保存在完整源码包中。

如果已经克隆仓库，请从完整源码包提取整个 `public/` 目录，放到项目根目录，与 `src/`、`server/` 和 `package.json` 同级。补齐后再启动或构建项目；完整源码包本身无需额外补齐素材。

## 本地运行

推荐 **Node.js 22.12+**、npm 和 **Python 3.9+**。后端使用 Python 标准库，不需要另装 Python 第三方依赖。

```bash
npm ci
```

在第一个终端启动后端：

```bash
npm run server
```

在第二个终端启动前端：

```bash
npm run dev
```

打开 [http://127.0.0.1:5192/](http://127.0.0.1:5192/)。前端把 `/api` 转发到本机 `127.0.0.1:8771`。首次运行会创建本地数据目录 `server/data/`，该目录已忽略，不应提交到 Git。

普通文件流程无需 Codex CLI。可选的 AI 草稿功能需要另行配置已授权的模型执行环境；默认关闭。

### 生产构建的本地预览

```bash
npm run build
python3 -m server.main --port 8771 --dist-dir dist
```

打开 [http://127.0.0.1:8771/](http://127.0.0.1:8771/)。后端仅监听回环地址。对外部署需配置自己的 HTTPS 反向代理与鉴权，不包含作者现有服务器配置或账户。

## 页面与材料入口

| 路径/文件 | 用途 |
|---|---|
| `#/home` | 视频首页及八业轮播 |
| `#/experience` | 八个行业冰块、介绍、声音与返回操作 |
| `#/sector/drug` 等 | 行业双图与“探索 Skills” |
| `#/research/factor-b` | 31 页原版药研资料阅读器 |
| `public/resources/skills/xian-eight-industries-skills.xlsx` | Skills、岗位、规则、排班和量化指标 |
| `public/resources/presentation-v6/` | 16 页路演 PPT/PDF 与生成配图 |
| `public/resources/speech/` | 一页 A4 口播稿 |
| `docs/project-guide/` | 项目说明 Word/PDF |

行业路由依次为 `drug`、`industry`、`ecommerce`、`retail`、`tourism`、`employment`、`government`、`agriculture`。小店经营在旧后端接口中使用 `finance` 标识。

首次直接打开二级链接时，有声播放可能受浏览器自动播放政策限制；从首页入口进入会在用户手势中尝试恢复音频。页面保留声音开关。

## 技术结构

```text
src/                    React + TypeScript 页面与交互
src/data/catalog.json   8 条文件流程使用的基础目录
server/                 Python HTTP API、SQLite、任务与文件流程
public/experience/      3D 场景页面、桥接和冰块标签
public/assets/          场景引擎与模型、贴图、声音等资源
public/media/           视频与行业双层配图
public/resources/       Skills 目录、Excel、PPT、PDF
tests/                  后端和关键前端交互回归
docs/                   项目说明与资源说明
```

前端使用 React、TypeScript、Vite 和 Motion；3D 场景复用 Three.js 参考引擎，双图效果采用 CSS mask。后端使用 Python 标准库、SQLite 和本地文件产物。

## 验证

```bash
npm run lint
npm run typecheck
npm test
node --test tests/experience-*.test.mjs tests/lithos-library.test.mjs
npm run build
```

早期工作台的 `ui-storage-isolation.test.mjs` 依赖已不存在的旧主题组件，因此未纳入此交付副本；原项目中的历史文件保持不变。当前前端验收范围为上方命令列出的三层入口与交互测试，也可运行 `npm run test:frontend`。

## 资源来源与许可

本仓库保留依赖和参考引擎已有的许可注释。生成图在对应资源目录中保存提示词与实际生成工具记录；概念配图不是企业现场照片。

该交付副本尚未指定覆盖全部内容的统一开源许可证。参考场景、声音、模型、字体和用户提供文档各有来源；现有资料不足以把整个素材包统一声明为 MIT。详见 [资源说明](docs/ASSETS.md)。

制作过程中的大型缓存、历史构建、运行数据库、密钥和生产部署记录不在源码交付范围内。PPT/Excel 成品可直接使用；其制作环境与网页的运行环境不同。
