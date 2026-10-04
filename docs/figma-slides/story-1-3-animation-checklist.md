# Story 1–3 · Figma Slides 动画清单（照片版）

> **注意（2026-10-04）：**Figma 文件已经被重新整理过（换了照片，加入了翻页时钟和很多过渡页），下面"页面顺序"和"对象动画"两张表里的页码已经对不上了。翻页时钟的最新做法见下一节。

## 分组和点击流程（故事部分只需要点 4 次）

Figma 按 section 从上到下、从左到右播放。每段动画页放在它前面那张主页后面的 section 里，可以折叠，播放顺序不变。

| Section | 内容 | 点击 |
|---|---|---|
| Story | 团队的第 1、2 页 → **开场（第 3 页）** → **10:00（第 4 页）** | 在开场页点 1 次；在 10:00 页点 1 次 |
| 动画 · 10:00 → 06:40 | 第 5–7 页：翻页，"I'm ready." 放大后淡出 | 全自动 |
| 06:40 | **06:40（第 8 页）** | 点 1 次 |
| 动画 · 06:40 → 03:10 | 第 9–34 页：06:38 "Walk me through…"、翻到 06:35、焦虑字块、"I knew exactly…"、单词掉落、黑屏光标、翻到 03:10 | 全自动 |
| 03:10 | **03:10（第 35 页）** | 点 1 次 |
| 动画 · 03:10 → Still waiting | 第 36–50 页：翻到 01:56、手机、锁屏、拇指、手机熄灭、翻到 01:50、"Still waiting." | 全自动，停在 "Still waiting." |
| Story（后半） | 团队的页面 | — |

自动播放的停留时间是按旁白语速（每秒约 2.4 个词）估的。哪一段画面和讲话对不上，就改那一页的 After delay：

| 页 | 停留 | 对应旁白 |
|---|---|---|
| 第 12 页（Walk me through…） | 4.0s | Back to the notes. Same line, three times. Still nothing. |
| 第 15 页（06:35 落定） | 4.0s | And now my hands are shaking… Maybe that'll help. |
| 第 16–25 页（字块堆叠） | 约 4s | But then there's this thought: "What if I freeze again?" |
| 第 26 页（大字块） | 2.5s | They're going to notice. |
| 第 27 页（I knew exactly…） | 3.2s | Last time, I knew exactly what I wanted to say. |
| 第 28–30 页（单词掉落） | 约 2.5s | The words just wouldn't come out. |
| 第 31 页（黑屏光标） | 5.5s | Okay. One more practice. Except… now I don't even know where to start. |
| 第 41 页（手机） | 2.0s | So I pick up my phone, and… my mind just goes blank. |
| 第 46 页（手机熄灭） | 2.5s | After a few seconds, the phone goes back on the desk. |

## 翻页时钟（电脑屏幕上的倒计时）

- **时间一律四位数：**10:00 → 06:40 → 06:38 → 06:35 → 03:10 → 01:56 → 01:50。前面的 0 一直显示，数字位置不再左右挪动。
- **两张卡片：**`computer_time` 里是两张卡片 `card_h`（分）和 `card_m`（秒），每张卡上两个数字（图层 `g`）。数字用的是 Inter Black，和后面手机锁屏上的时间同一个字体，但转成了矢量，横向压窄到 82%、纵向拉高到 118%，所以改数字要重新跑脚本，不能直接改字。分钟靠右、秒靠左，两组之间留一个窄空隙。卡片颜色和电脑屏幕背景完全一样，所以看不出卡片的边，只看得到数字和中间一条很淡的铰链线。
- **重影也是翻页时钟：**有重影的页（`photo` 里的 `ghost 1`、`ghost 2`，还有开场页隐藏的 `3 · awake`）里，每一份 `computer_time` 都是同样的两张卡，翻页时一起翻。
- **每次换时间，两张卡都会翻页，数字没变也照样翻。**每次翻页由 3 张过渡页组成，前后接在场景页之间：
  1. **起始页**（Smart Animate 0.22s，ease in，0.05s 后自动进入下一页）：旧数字的上半片立着，新数字的下半片压在铰链处。
  2. **中间页**（Smart Animate 0.3s，bouncy，立即自动进入下一页）：上半片从上往下收向铰链并变暗，下半片的上缘落下阴影，这时露出新数字的上半。上半片是被"裁掉"而不是被压扁，所以数字不会变形、不会有拉扯感。
  3. **结束页**（Dissolve 0.01s，看起来就是直接切换，0.05s 后自动进入新场景）：新数字的下半片从铰链翻开展平。这里不能用"无过渡"：Figma 会把"无过渡"的自动跳转改回点击，结果每次翻完都要多点一下。
- **操作方式：**在旧场景点一下，翻页动画自动播完，停在新场景，等下一次点击。
- **图层结构**（每张卡相同，名字不要改）：`top_static` / `bottom_static` / `top_flap`（含 `shade`）/ `bottom_flap`（含 `shade`）/ `hinge`。`bottom_static` 里还有一层 `drop`，就是翻页时落下的阴影。

## "I'm ready." 放大、变淡、消失（第 4–9 页）

- 第 4 页（10:00）："I think" 和 "I'm ready." 在画面下方，Elms Sans 52。
- 第 4 页点击后进入第 5 页：Smart Animate 0.6s。"I'm ready." 放大到 120，移到画面正中、电脑上方的墙面上；"I think" 淡出。
- 第 5 → 6 → 7 页是自动播放的翻页，"I'm ready." 的透明度随之从 100% 降到 60%，再降到 30%。
- 第 7 → 8 页：用 0.6s 的 Dissolve 自动过渡（只有这一处不是 0.01s）。两页的画面除了这句话完全一样，所以看起来只有它在慢慢淡掉。
- 第 8 页（06:40）：这句话已经完全消失，停在这里讲。
- 图层名都是 `4b · I'm ready.`，不要改，Smart Animate 靠这个名字配对。

## 焦虑文字页（第 12–26 页）

参考的是"黑底白字标签块、各种角度乱贴、最后铺满屏幕"的视觉。

- **第 12 页**（06:38，"Walk me through your design process."）点一下之后，后面全部自动播放：
  1. **第 13–15 页**：时钟从 06:38 翻到 06:35，画面上只有照片和时钟，没有字。
  2. **第 15 → 16 页**：时钟落定后停 4s（配合 "hands are shaking" 那句），第一块字以 0.15s 的 Dissolve 出现。
  3. **第 16–25 页**：每页多贴几块，累计块数依次是 1、2、3、5、8、13、21、34、52、78。前三块是一块一块出现，之后几块几块出现，越来越快：每页停留时间 0.55s → 0.08s，每次 Smart Animate 0.12s。
  4. **第 22–25 页**：字块底下加一层黑底 `anx_bg`，透明度 25% → 50% → 80% → 100%，照片和时钟被一点点埋掉。
  5. **第 26 页**：停 0.35s 后，最上面盖上一块大的 "What if I freeze again?"（`b_freeze`，150px，倾斜 3°），停 2.5s 后自动进入下一页。
- **第 26 → 27 页**（"I knew exactly what I wanted to say."）：Smart Animate 1.2s，自动，满屏的字淡出。
- **字块样式：**黑底，白字 Elms Sans Light 带光晕，字号 56–124。角度大多是 0°、±90°、180°，少数斜 5–22°。
- **图层：**每页都有一个 `anx` 组，里面是 `b01`…`b78`（顺序就是出现顺序）、`anx_bg`、`b_freeze`。名字不要改，Smart Animate 靠名字配对。
- **措辞：**用的都是原来那 10 句焦虑的话，另外拆出了几个短句来填空，比如 "Blank."、"Can't think."、"Out of time."、"Nervous."、"Can't speak."、"Freeze."。

文件：https://www.figma.com/slides/FDimDe1JBAGF2fDnU1jlR3

## 视觉系统（和团队后半部分的页面统一，色调保持黑白）

- **字体：**故事部分的所有文字都用 Elms Sans，和团队的页面一样：正文用 Light，关键词用 Bold 或加下划线。字距 -1.1%，行高 113%。
  - "I think I'm **ready.**"
  - "Walk me through your **design process.**"
  - "I knew <u>exactly</u> what I wanted to **say.**"
  - "Still **waiting.**"
  - 大字块 "What if I <u>freeze</u> **again?**"，和团队页面上的 "<u>Panic</u> happens **fast**." 是同一种写法。
- **文字颜色和光晕：**纯白，带一圈白色光晕（白色阴影，透明度 71%，半径 14–18）。焦虑字块上的字光晕弱一点（60%，半径 10）。
- **背景：**
  - 照片页仍然是那张暗调桌面照片，本身就是黑白。第 3 页的照片上面试加了一层胶片噪点（图层 `grain`，在 `photo` 正上方），其他页还没加。
  - `grain` 的做法：一个铺满画面的黑色矩形，混合模式设为 Screen（纯黑在 Screen 下等于不改变画面），再加 Noise 效果（Monotone，白色 18%，大小 1.6，密度 0.6）。想要噪点更重或更轻，只改这个 18%。
  - 没有照片的页（第 27–30 页、第 51 页）用团队统计页的同一张颗粒渐变纹理（图层 `bg_tex`），饱和度调到 -1，变成黑白。
- **没有改的：**电脑上的翻页时钟和手机锁屏上的时间、日期仍然是 Inter（时钟是压窄的 Inter Black，和手机时间同一个字体）。它们是设备界面，不跟着叙事文字换字体。

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
