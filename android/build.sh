#!/bin/bash
# 打包安卓 APK（套壳：用 Chrome 打开 lw.profess0r.com，系统栏颜色随深浅色切换）
# 需要：JDK 17、/opt/android-sdk、/opt/android-build 里装好的 @bubblewrap/core
# 签名密钥在 /etc/loseweight/android.keystore，密码在 /etc/loseweight/android-keystore.pass，都不进 Git。
# 密钥丢了就没法覆盖升级，只能卸载重装。
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
B=/opt/android-build
OUT=${1:-$HERE/../public/download/shike-mine.apk}
cp "$HERE/gen.mjs" $B/gen.mjs
rm -rf $B/project
node $B/gen.mjs "$HERE/twa-manifest.json" $B/project
cd $B/project
echo "sdk.dir=/opt/android-sdk" > local.properties
echo "org.gradle.jvmargs=-Xmx1024m" >> gradle.properties
./gradlew assembleRelease --no-daemon -q
PW=$(cat /etc/loseweight/android-keystore.pass)
mkdir -p "$(dirname "$OUT")"
/opt/android-sdk/build-tools/35.0.0/zipalign -f -p 4 app/build/outputs/apk/release/app-release-unsigned.apk /tmp/shike-aligned.apk
/opt/android-sdk/build-tools/35.0.0/apksigner sign --ks /etc/loseweight/android.keystore --ks-key-alias shike \
  --ks-pass pass:$PW --key-pass pass:$PW --out "$OUT" /tmp/shike-aligned.apk
rm -f /tmp/shike-aligned.apk
echo "APK: $OUT"
