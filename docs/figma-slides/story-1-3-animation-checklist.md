# Story 1–3 · Figma Slides 动画清单（照片版）

文件：https://www.figma.com/slides/FDimDe1JBAGF2fDnU1jlR3

## 视觉系统

- **一张照片。**暗调的桌面和手部照片居中放置，四周和黑底 `#0C0C0D` 融在一起。全片的镜头都来自这一张照片：全景 → 笔记 → 手 → 电脑屏幕，用 Smart Animate 推近或平移切换。
- **时间在照片后面。**倒计时用 Inter Black 560，做成透明度 16% 的水印，放在照片后面，场景里只从照片两侧露出一部分。
- **时间卡。**换时间时插一张时间卡：照片淡到 12%，数字变成实心米白并滚动，约 1 秒后自动回到下一个场景。
- **文字。**正文 Inter Medium 44，标题 Inter Black 112，颜色米白 `#F2ECDE`。

## 页面顺序（第 1、14 页是团队的页面，没有改动）

| 幻灯片 | 内容 | 进入时的过渡 |
|---|---|---|
| 2 | 10:00 开场（全黑） | — |
| 3 | 照片 · "I think I'm ready." | Smart Animate 1.6s · 点击 |
| 4 | **时间卡 6:40** | Smart Animate 1.4s · 点击 |
| 5 | 走廊（门缝 + 声波） | Smart Animate 1.2s · **自动（1 秒后）** |
| 6 | 推近到笔记 · 那一句问题 | Smart Animate 1.2s · 点击 |
| 7 | 推近到手 · What if I freeze again? | Smart Animate 1.2s · 点击 |
| 8 | 撕裂 | Smart Animate **0.15s linear** · 点击 |
| 9 | 单词掉落 → 光标 | Smart Animate 1.4s ease in · 点击 |
| 10 | **时间卡 3:10**（光标飞进冒号） | Smart Animate 1.6s · 点击 |
| 11 | 手机冷光 / 白屏 | Smart Animate 1.2s · **自动（1 秒后）** |
| 12 | 锁屏 · 拇指 | Smart Animate 1.2s · 点击 |
| 13 | 推近到电脑 · Still waiting. | Smart Animate 1.6s · 点击 |

> **试播时请确认：**第 5、11 页设置的是"After delay 1s"。如果 Figma 的实际效果是"离开这一页时自动翻页"，就把这个设置改到第 4、10 页（时间卡）上。

每页的 speaker notes 里都写了讲稿和 ▶ 点击时机。

## 需要手动加的对象动画（25 个）

在 **Animate 面板 → Object animations** 里添加，图层名前面的编号就是点击顺序。

| 幻灯片 | ▶ 点击 | 图层 | 动画 | 开始 |
|---|---|---|---|---|
| 3 | 1 | `1 · four` | 进入 · Fade | On click |
| 3 | 2 | `2 · eyelids` | 进入 · Fade | On click |
| 3 | 3 | `3 · awake` | 进入 · Fade（越快越好） | On click |
| 3 | 4 | `4a · I think` | 进入 · Fade | On click |
| 3 | 4 | `4b · I'm ready.` | 进入 · Fade | After previous |
| 5 | 1 | `1a · door` | 进入 · Fade | On click |
| 5 | 1 | `1b · voices` | 进入 · Slide in（从右） | After previous |
| 5 | 2 | `2a · blur` | 进入 · Fade | On click |
| 5 | 2 | `2b · door light` | 进入 · Fade | After previous |
| 6 | 1 | `1a · again` | 进入 · Fade | On click |
| 6 | 1 | `1b · again` | 进入 · Fade | After previous |
| 6 | 1 | `1c · nothing` | 进入 · Fade | After previous |
| 7 | 1 | `tuck` | 进入 · Slide in（从下） | On click |
| 7 | 2 | `title_freeze` | 进入 · Fade | On click |
| 8 | 1 | `flash` | 进入 · Fade | On click |
| 8 | 1 | `sentence` | 进入 · Fade | After previous |
| 9 | 1 | `1 · screen` | 进入 · Fade | On click |
| 9 | 1 | `cursor` | 进入 · Fade | After previous |
| 9 | 2 | `2 · dark` | 进入 · Fade | On click |
| 11 | 1 | `1 · phone glow` | 进入 · Fade | On click |
| 11 | 2 | `2 · blank` | 进入 · Fade（快） | On click |
| 12 | 1 | `1 · thumb` | **退出** · Slide out（向下） | On click |
| 12 | 1 | `2 · dim` | 进入 · Fade | After previous |
| 12 | 2 | `3 · off` | 进入 · Fade | On click |
| 13 | 1 | `1 · Still waiting.` | 进入 · Fade | On click |

## 不要改名的图层

Smart Animate 靠"同名 + 同层级"在前后页之间配对，下面这些图层改了名字，过渡就会变成跳切：

`timer`（`d1` `d2` `colon` `d3` `d4` / `strip`）· `photo`（`shot` / `img` / `fade_l` / `fade_r` / `ghost 1–2` / `dim`）· `tuck` · `title_freeze`（`band 1–5`）· `flash` · `sentence`（`w1 I` … `w8 say.`）· `cursor`

## 换照片

所有页的照片都是同一张图（`img` 图层的图片填充）。换照片的步骤：

1. 把新照片拖到任意一页；
2. 用脚本或手动，把所有名为 `img` 的图层的填充换成这张新图。

照片需要是 2:3 的竖图（目前用的是 720×1080），推近镜头的取景点是按这张照片定的：

- 笔记：中心约 (130, 590)，放大 2.2 倍；
- 手：中心约 (330, 575)，放大 1.9 倍；
- 电脑：中心约 (160, 250)，放大 1.8 倍。

如果换成构图不同的照片，这三个取景点要跟着调。
