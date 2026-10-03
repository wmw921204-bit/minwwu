# Story 1–3 · Figma Slides 动画清单（照片版）

文件：https://www.figma.com/slides/FDimDe1JBAGF2fDnU1jlR3

## 视觉系统

- **一张照片，铺满全屏。**用的是一张横版的暗调桌面照片（台灯、电脑、笔记本、手机、杯子），铺满 16:9 画面。全片所有镜头都来自这一张照片，用 Smart Animate 推近或平移切换：全景 → 本子 → 桌沿 → 手机 → 电脑屏幕。取景始终不超出照片范围，不会露黑边。
- **时间水印。**倒计时用 Inter Black 560，做成透明度 6% 的水印，叠在照片上面。
- **时间卡。**换时间时插一张时间卡：照片淡到 12%，数字变成实心米白并滚动。
- **文字。**正文 Inter Medium 44，标题 Inter Black 112，颜色米白 `#F2ECDE`。

## 页面顺序（第 1、14 页是团队的页面，没有改动）

| 幻灯片 | 内容 | 镜头 | 过渡设置 |
|---|---|---|---|
| 2 | 10:00 开场（全黑） | 电脑屏幕特写，透明度 0 | Smart Animate 1.2s · 点击 |
| 3 | "I think I'm ready." | **从电脑屏幕往后拉，整个桌面亮起来** | Smart Animate 2.0s · 点击 |
| 4 | **时间卡 6:40** | 全景（淡到 12%） | Smart Animate 1.4s · 点击 |
| 5 | 走廊（门外的光） | 全景 | Smart Animate 1.2s · 自动（1 秒后） |
| 6 | 那一句问题 | 推近到本子 | Smart Animate 1.2s · 点击 |
| 7 | What if I freeze again? | 推近到桌沿（重影 = 在抖） | Smart Animate 1.2s · 点击 |
| 8 | 撕裂 | 同上 | Smart Animate **0.15s linear** · 点击 |
| 9 | 单词掉落 → 光标 | 同上 | Smart Animate 1.4s · 点击 |
| 10 | **时间卡 3:10**（光标飞进冒号） | 全景（淡到 12%） | Smart Animate 1.6s · 点击 |
| 11 | 手机亮 / 白屏 | 推近到桌上的手机 | Smart Animate 1.2s · 自动（1 秒后） |
| 12 | 锁屏 · 拇指 | 全景（淡到 25%） | Smart Animate 1.2s · 点击 |
| 13 | Still waiting. | 推近到电脑屏幕 | Smart Animate 1.6s · 点击 |

> **试播时请确认：**Figma 的过渡设置不确定是算在"进入这一页"还是"离开这一页"。第 2 页和第 3 页都设成了 Smart Animate，所以这两页之间一定会有动画。如果别的页出现"该动的没动"或者"自动翻页的位置不对"，告诉我是哪两页之间，我把设置整体挪一页。

每页的 speaker notes 里都写了讲稿和 ▶ 点击时机。

## 需要手动加的对象动画（24 个）

在 **Animate 面板 → Object animations** 里添加，图层名前面的编号就是点击顺序。

| 幻灯片 | ▶ 点击 | 图层 | 动画 | 开始 |
|---|---|---|---|---|
| 3 | 1 | `1 · four` | 进入 · Fade | On click |
| 3 | 2 | `2 · eyelids` | 进入 · Fade | On click |
| 3 | 3 | `3 · awake` | 进入 · Fade（越快越好） | On click |
| 3 | 4 | `4a · I think` | 进入 · Fade | On click |
| 3 | 4 | `4b · I'm ready.` | 进入 · Fade | After previous |
| 5 | 1 | `1 · light` | 进入 · Fade（慢一点） | On click |
| 5 | 2 | `2a · blur` | 进入 · Fade | On click |
| 5 | 2 | `2b · light flood` | 进入 · Fade（慢一点） | After previous |
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

`timer`（`d1` `d2` `colon` `d3` `d4` / `strip`）· `photo`（`shot` / `img` / `ghost 1–2` / `dim`）· `tuck` · `title_freeze`（`band 1–5`）· `flash` · `sentence`（`w1 I` … `w8 say.`）· `cursor`

## 换照片

所有页的照片都是同一张图（`img` 图层的图片填充）。换照片的步骤：

1. 把新照片拖到第 3 页；
2. 用脚本把所有 `img` 图层的填充换成这张新图。

取景参数按 1199×799 的原图坐标计算，放大倍数相对于原图：

| 镜头 | 中心点 | 放大倍数 |
|---|---|---|
| 全景 | (600, 400) | 1.6（刚好铺满宽度） |
| 电脑屏幕（开场、第 13 页） | (615, 410–420) | 2.4–2.6 |
| 本子 | (570, 607) | 3.0 |
| 桌沿 | (560, 600) | 2.4 |
| 手机 | (858, 565) | 2.6 |

如果换成构图不同的照片，这些取景点要跟着调。
