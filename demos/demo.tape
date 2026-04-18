# LemonCake デモ動画
# 生成: vhs demos/demo.tape
# 出力: demos/demo.gif と demos/demo.mp4

Output demos/demo.gif
Output demos/demo.mp4

Set Shell "zsh"
Set FontSize 15
Set FontFamily "JetBrains Mono"
Set Width 900
Set Height 520
Set Theme "Dracula"
Set Padding 24
Set TypingSpeed 40ms
Set PlaybackSpeed 0.9

# ── 起動 ──
Sleep 500ms
Type "cd /Users/workoutsomehow/adhunt-pro"
Enter
Sleep 300ms

# ── 環境変数をセット（実際の値に書き換えて実行）──
# Type "export LEMON_CAKE_PAY_TOKEN=eyJhbGci..."
# Enter
# Type "export LEMON_CAKE_BUYER_JWT=eyJhbGci..."
# Enter
# Sleep 200ms

# ── デモ実行 ──
Type "node demos/run-demo.mjs"
Enter
Sleep 500ms

# Step 1: list_services
Sleep 1200ms

# Step 2: call_service
Sleep 2000ms

# Step 3: check_balance
Sleep 1800ms

# ── エンド画面を数秒見せる ──
Sleep 3s
