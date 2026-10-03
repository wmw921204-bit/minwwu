# Story 1–3 · Figma Slides 动画清单（极简版）

文件：https://www.figma.com/slides/FDimDe1JBAGF2fDnU1jlR3

## 视觉系统

- **黑底加一束光。**全片只有黑 `#0C0C0D` 和米白 `#F2ECDE`，不用渐变、不用照片。
- **一个隐喻。**电脑的光照着很小的 Alex，他在墙上的影子随着时间越变越大，光束也越压越窄。
- **倒计时水印。**Inter Black 560，灰色，透明度 22%，放在画面正中；只有开场第 1 页是实心米白。换段落时数字原地滚动：10:00 → 6:40 → 3:10。
- **文字。**正文 Inter Medium 44，标题 Inter Black 112。

## 已经做好的（脚本生成）

| 幻灯片 | 对应讲稿 | 进入时的过渡（已设置） | 翻页时发生的变化 |
|---|---|---|---|
| 1 | 10:00 · 全黑开场 | — | — |
| 2 | 10:00 · 房间 | Smart Animate 1.6s | 光亮起，照出 Alex；10:00 退成水印 |
| 3 | 6:40 · 走廊 | Smart Animate 1.4s | 数字滚动，光收窄，墙上的影子变大 |
| 4 | 那一句问题 | Smart Animate 1.2s | 换成黑底 |
| 5 | 手 · What if I freeze again? | Smart Animate 1.0s | 换成桌沿线 |
| 6 | 撕裂 | Smart Animate **0.15s linear** | 标题被横向撕开 |
| 7 | 单词掉落 → 光标 | Smart Animate 1.4s ease in | 单词往下掉 |
| 8 | 3:10 · 手机 | Smart Animate 1.6s | 光标飞进冒号，6:40 → 3:10 |
| 9 | 锁屏 · 拇指 | Smart Animate 1.2s | 换成锁屏 |
| 10 | Still waiting. | Smart Animate 1.6s | 光压成一条缝，影子吞掉了光 |

每页的 speaker notes 里都写了讲稿和 ▶ 点击时机。

## 需要手动加的对象动画（24 个）

Figma 的插件 API 不能创建对象动画，下面这些要在 **Animate 面板 → Object animations** 里手动添加。
图层名前面的编号就是点击顺序。

| 幻灯片 | ▶ 点击 | 图层 | 动画 | 开始 |
|---|---|---|---|---|
| 2 | 1 | `1 · four` | 进入 · Fade | On click |
| 2 | 2 | `2 · eyelids` | 进入 · Fade | On click |
| 2 | 3 | `3 · awake` | 进入 · Fade（越快越好） | On click |
| 2 | 4 | `4a · I think` | 进入 · Fade | On click |
| 2 | 4 | `4b · I'm ready.` | 进入 · Fade | After previous |
| 3 | 1 | `1a · door` | 进入 · Fade | On click |
| 3 | 1 | `1b · voices` | 进入 · Slide in（从右） | After previous |
| 3 | 2 | `2 · door open` | 进入 · Fade | On click |
| 4 | 1 | `1a · again` | 进入 · Fade | On click |
| 4 | 1 | `1b · again` | 进入 · Fade | After previous |
| 4 | 1 | `1c · nothing` | 进入 · Fade | After previous |
| 5 | 1 | `1 · hands` | **退出** · Slide out（向下） | On click |
| 5 | 2 | `title_freeze` | 进入 · Fade | On click |
| 6 | 1 | `flash` | 进入 · Fade | On click |
| 6 | 1 | `sentence` | 进入 · Fade | After previous |
| 7 | 1 | `1 · screen` | 进入 · Fade | On click |
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

`light` · `shadow` · `alex` · `shutter_top` · `shutter_bottom` · `shutter_right` · `laptop` · `timer`（`d1` `d2` `colon` `d3` `d4` / `strip`）· `desk_line` · `desk_front` · `title_freeze`（`band 1–5`）· `flash` · `sentence`（`w1 I` … `w8 say.`）· `cursor`

## 想自己微调的话

- **光束宽窄。**光束是两块黑色的"遮光板"（`shutter_top`、`shutter_bottom`），以电脑屏幕为轴旋转形成的：
  - 旋转后，必须把这两块的 X/Y 改回 `1314, 662`（也就是光源点）；
  - 光束上沿的角度 α 对应 `shutter_top` 的旋转值 `180 − α`，下沿的角度 β 对应 `shutter_bottom` 的旋转值 `β − 90`；
  - 第 2、3、10 页目前的角度分别是 α 22° / 20° / 19.5°，β 12° / 7° / 3°。
- **影子大小。**直接缩放 `shadow` 图层。光束以外的部分会被遮光板自动遮掉。

## 试播注意

- 用**浏览器**演示，并切到观众视图检查过渡。
- 第 7 页的光标是一个闪烁 GIF。如果演示时不闪，就当作静止的光标。
- 第 6 页的撕裂只有 0.15 秒，讲到 *They're going to notice.* 时点击，然后停 2 秒。
