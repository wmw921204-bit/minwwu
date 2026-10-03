# Story 1–3 · Figma Slides 动画清单

文件：https://www.figma.com/slides/FDimDe1JBAGF2fDnU1jlR3

## 已经做好的（脚本生成）

| 幻灯片 | 对应讲稿 | 进入时的过渡（已设置） |
|---|---|---|
| 1 | 10:00 · 全黑开场 | — |
| 2 | 10:00 · 房间 | Smart Animate 1.6s ease in-out |
| 3 | 6:40 · 走廊声音 | Smart Animate 1.4s（数字 10:00 → 6:40） |
| 4 | 笔记特写 | Smart Animate 1.2s（推近到笔记） |
| 5 | 手 · What if I freeze again? | Smart Animate 1.0s |
| 6 | 撕裂 / 卡住 | Smart Animate **0.15s linear** |
| 7 | 单词掉落 → 光标 | Smart Animate 1.4s ease in |
| 8 | 3:10 · 手机亮 / 白屏 | Smart Animate 1.6s（光标飞成冒号，6:40 → 3:10） |
| 9 | 锁屏 · 拇指 | Smart Animate 1.2s |
| 10 | Still waiting. | Smart Animate 1.6s（平移到电脑） |

每页的 speaker notes 里都写了讲稿和 ▶ 点击时机。

## 需要手动加的对象动画（30 个）

Figma 的插件 API 不能创建对象动画，下面这些要在 **Animate 面板 → Object animations** 里手动添加。
图层名前面的编号就是点击顺序（`1a` = 第 1 次点击的第 1 个动画）。

| 幻灯片 | ▶ 点击 | 图层 | 动画 | 开始 |
|---|---|---|---|---|
| 2 | 1 | `1a · interviews` | 进入 · Slide in（从右） | On click |
| 2 | 1 | `1b · past` | 进入 · Fade | After previous |
| 2 | 2 | `2a · haze` | 进入 · Fade | On click |
| 2 | 2 | `2b · eyelids` | 进入 · Fade | After previous |
| 2 | 3 | `3 · awake` | 进入 · Fade（越快越好） | On click |
| 2 | 4 | `4a · glow laptop` | 进入 · Fade | On click |
| 2 | 4 | `4b · glow portfolio` | 进入 · Fade | After previous |
| 2 | 4 | `4c · glow notes` | 进入 · Fade | After previous |
| 2 | 5 | `5a · I think` | 进入 · Fade | On click |
| 2 | 5 | `5b · I'm ready.` | 进入 · Fade | After previous |
| 3 | 1 | `1 · hallway` | 进入 · Slide in（从左） | On click |
| 3 | 2 | `2a · haze` | 进入 · Fade | On click |
| 3 | 2 | `2b · voices` | 进入 · Fade | After previous |
| 4 | 1 | `1a · again` | 进入 · Fade | On click |
| 4 | 1 | `1b · again` | 进入 · Fade | After previous |
| 4 | 1 | `1c · nothing` | 进入 · Fade | After previous |
| 5 | 1 | `1a · hands` | **退出** · Slide out（向下） | On click |
| 5 | 1 | `tuck` | 进入 · Slide in（从下） | After previous |
| 5 | 2 | `title_freeze` | 进入 · Fade | On click |
| 6 | 1 | `flash` | 进入 · Fade | On click |
| 6 | 1 | `sentence` | 进入 · Fade | After previous |
| 7 | 1 | `1 · doc` | 进入 · Fade | On click |
| 7 | 1 | `cursor` | 进入 · Fade | After previous |
| 7 | 2 | `2 · dark` | 进入 · Fade | On click |
| 8 | 1 | `1 · phone lit` | 进入 · Fade | On click |
| 8 | 2 | `2 · blank` | 进入 · Fade（快） | On click |
| 9 | 1 | `1 · thumb` | **退出** · Slide out（向下） | On click |
| 9 | 1 | `2 · dim` | 进入 · Fade | After previous |
| 9 | 2 | `3 · off` | 进入 · Fade | On click |
| 10 | 1 | `1 · Still waiting.` | 进入 · Fade | On click |

## 不要改名的图层

Smart Animate 靠"同名 + 同层级"在前后页之间配对，下面这些图层改了名字，过渡就会变成跳切：

`bg_room`（以及里面所有子图层）· `overlay_black` · `vignette` · `timer`（`d1` `d2` `colon` `d3` `d4` / `strip`）· `bar_top` · `bar_bottom` · `scene_desk` / `band 1–5` · `title_freeze` · `title_r` · `title_c` · `tuck` · `flash` · `sentence`（`w1 I` … `w8 say.`）· `cursor`

## 之后换成实拍照片

- 画面里的房间、手、手机、拇指都是占位插画。换照片时，**保留外层图层名**，只替换里面的内容：
  - 在 `bg_room` 里放一张图片填充的矩形，盖住原来的插画即可；
  - 每一页的 `bg_room` 都要换同一张照片，因为推近和平移靠的就是它在每页的不同缩放和位置。
- 手（第 5 页）和拇指（第 9 页）换成抠图 PNG，保留 3 层残影的做法：同一张图复制 3 份，错开几像素，透明度分别是 100 / 35 / 18%。

## 试播注意

- 用**浏览器**演示，并切到观众视图检查过渡。
- 第 7 页的光标是一个闪烁 GIF。如果演示时不闪，就当作静止的光标。
- 第 6 页的撕裂只有 0.15 秒，讲到 *They're going to notice.* 时点击，然后停 2 秒。
