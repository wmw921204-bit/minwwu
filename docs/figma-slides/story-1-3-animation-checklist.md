# Story 1–3 · Figma Slides 动画清单（照片版）

> **注意（2026-10-04）：**Figma 文件已经被重新整理过（换了照片，加入了翻页时钟和很多过渡页），下面"页面顺序"和"对象动画"两张表里的页码已经对不上了。翻页时钟的最新做法见下一节。

## 翻页时钟（电脑屏幕上的倒计时）

- **时间一律四位数：**10:00 → 06:40 → 06:38 → 06:35 → 03:10 → 01:56 → 01:50。前面的 0 一直显示，数字位置不再左右挪动。
- **两张卡片：**`computer_time` 里是两张卡片 `card_h`（分）和 `card_m`（秒），每张卡上两个数字（文字图层 `g`，字体 Inter Black，和后面手机锁屏上的时间同一个字体）。卡片颜色和电脑屏幕背景完全一样，所以看不出卡片的边，只看得到数字和中间一条很淡的铰链线。
- **重影也是翻页时钟：**有重影的页（`photo` 里的 `ghost 1`、`ghost 2`，还有开场页隐藏的 `3 · awake`）里，每一份 `computer_time` 都是同样的两张卡，翻页时一起翻。
- **每次换时间，两张卡都会翻页，数字没变也照样翻。**每次翻页由 3 张过渡页组成，前后接在场景页之间：
  1. **起始页**（Smart Animate 0.22s，ease in，0.05s 后自动进入下一页）：旧数字的上半片立着，新数字的下半片压在铰链处。
  2. **中间页**（Smart Animate 0.3s，bouncy，立即自动进入下一页）：上半片从上往下收向铰链并变暗，下半片的上缘落下阴影，这时露出新数字的上半。上半片是被"裁掉"而不是被压扁，所以数字不会变形、不会有拉扯感。
  3. **结束页**（无过渡，0.05s 后自动进入新场景）：新数字的下半片从铰链翻开展平。
- **操作方式：**在旧场景点一下，翻页动画自动播完，停在新场景，等下一次点击。
- **图层结构**（每张卡相同，名字不要改）：`top_static` / `bottom_static` / `top_flap`（含 `shade`）/ `bottom_flap`（含 `shade`）/ `hinge`。`bottom_static` 里还有一层 `drop`，就是翻页时落下的阴影。

文件：https://www.figma.com/slides/FDimDe1JBAGF2fDnU1jlR3

## 视觉系统

- **一张照片，铺满全屏。**用的是一张横版的暗调桌面照片（台灯、电脑、笔记本、手机、杯子），铺满 16:9 画面。全片所有镜头都来自这一张照片，用 Smart Animate 推近或平移切换：全景 → 本子 → 桌沿 → 手机 → 电脑屏幕。取景始终不超出照片范围，不会露黑边。
- **时间水印。**倒计时用 Inter Black 560，做成透明度 6% 的水印，叠在照片上面。
- **时间卡。**换时间时插一张时间卡：照片淡到 12%，数字变成实心米白并滚动。
- **文字。**正文 Inter Medium 44，标题 Inter Black 112，颜色米白 `#F2ECDE`。

## 页面顺序（第 1、13 页是团队的页面，没有改动）

| 幻灯片 | 内容 | 镜头 | 过渡设置 |
|---|---|---|---|
| 2 | 10:00 开场（全黑） | 电脑屏幕特写，透明度 0 | Smart Animate 1.2s · 点击 |
| 3 | "I think I'm ready." | **从电脑屏幕往后拉，整个桌面亮起来** | Smart Animate 2.0s · 点击 |
| 4 | **时间卡 6:40** | 全景（淡到 12%） | Smart Animate 1.4s · 点击 |
| 5 | 走廊的声音（只靠讲）+ 那一句问题 | 推近到本子 | Smart Animate 1.4s · 点击 |
| 6 | What if I freeze again? | 推近到桌沿（重影 = 在抖） | Smart Animate 1.2s · 点击 |
| 7 | 撕裂 | 同上 | Smart Animate **0.15s linear** · 点击 |
| 8 | 单词掉落 → 光标 | 同上 | Smart Animate 1.4s · 点击 |
| 9 | **时间卡 3:10**（光标飞进冒号） | 全景（淡到 12%） | Smart Animate 1.6s · 点击 |
| 10 | 手机亮 / 白屏 | 推近到桌上的手机 | Smart Animate 1.2s · 点击 |
| 11 | 锁屏 · 拇指 | 全景（淡到 25%） | Smart Animate 1.2s · 点击 |
| 12 | Still waiting. | 推近到电脑屏幕 | Smart Animate 1.6s · 点击 |

> 所有翻页都是点击触发，没有自动翻页：点一下，翻到下一页，过渡动画随之播放。
>
> **试播时请确认：**Figma 的过渡设置不确定是算在"进入这一页"还是"离开这一页"。第 2 页和第 3 页都设成了 Smart Animate，所以这两页之间一定会有动画。如果别的页出现"该动的没动"，告诉我是哪两页之间，我把设置整体挪一页。

每页的 speaker notes 里都写了讲稿和 ▶ 点击时机。

## 需要手动加的对象动画（21 个）

在 **Animate 面板 → Object animations** 里添加，图层名前面的编号就是点击顺序。

| 幻灯片 | ▶ 点击 | 图层 | 动画 | 开始 |
|---|---|---|---|---|
| 3 | 1 | `1 · four` | 进入 · Fade | On click |
| 3 | 2 | `2 · eyelids` | 进入 · Fade | On click |
| 3 | 3 | `3 · awake` | 进入 · Fade（越快越好） | On click |
| 3 | 4 | `4a · I think` | 进入 · Fade | On click |
| 3 | 4 | `4b · I'm ready.` | 进入 · Fade | After previous |
| 5 | 1 | `1a · again` | 进入 · Fade | On click |
| 5 | 1 | `1b · again` | 进入 · Fade | After previous |
| 5 | 1 | `1c · nothing` | 进入 · Fade | After previous |
| 6 | 1 | `tuck` | 进入 · Slide in（从下） | On click |
| 6 | 2 | `title_freeze` | 进入 · Fade | On click |
| 7 | 1 | `flash` | 进入 · Fade | On click |
| 7 | 1 | `sentence` | 进入 · Fade | After previous |
| 8 | 1 | `1 · screen` | 进入 · Fade | On click |
| 8 | 1 | `cursor` | 进入 · Fade | After previous |
| 8 | 2 | `2 · dark` | 进入 · Fade | On click |
| 10 | 1 | `1 · phone glow` | 进入 · Fade | On click |
| 10 | 2 | `2 · blank` | 进入 · Fade（快） | On click |
| 11 | 1 | `1 · thumb` | **退出** · Slide out（向下） | On click |
| 11 | 1 | `2 · dim` | 进入 · Fade | After previous |
| 11 | 2 | `3 · off` | 进入 · Fade | On click |
| 12 | 1 | `1 · Still waiting.` | 进入 · Fade | On click |

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
| 电脑屏幕（开场、第 12 页） | (615, 410–420) | 2.4–2.6 |
| 本子 | (570, 607) | 3.0 |
| 桌沿 | (560, 600) | 2.4 |
| 手机 | (858, 565) | 2.6 |

如果换成构图不同的照片，这些取景点要跟着调。
