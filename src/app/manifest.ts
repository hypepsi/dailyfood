import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "食刻 · 饮食记录",
    short_name: "食刻",
    description: "拍一顿，记一顿",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // 安卓把这个颜色用在屏幕最下面的系统手势条上，而且装到桌面后就固定了、不跟深色模式变。
    // 手机平时用深色模式，所以这里用深色，避免底部出现一条白边
    background_color: "#131514",
    theme_color: "#131514",
    lang: "zh-CN",
    icons: [
      { src: "/icons/icon-192.png?v=2", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png?v=2", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
