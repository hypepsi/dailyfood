/**
 * AI 偶尔会把推算过程塞进食物名称或数量里（“本人约225–260克，按242.5克估算”），
 * 在页面上既放不下也看不懂。这里统一收短：说明留在 AI 的 note 里，名称和数量只留要点。
 */

/** 数量只留第一句，例如“2个，每个连馅料约240克……” → “2个” */
export function shortQuantity(text: string): string {
  const first = text.trim().replace(/^本人/, "").split(/[，,；;（(]/)[0].trim();
  return (first || text.trim()).slice(0, 12);
}

/** 名称太长时去掉括号里的补充（“（疑似）”保留），例如“菜煎饼（胡萝卜、莴笋、豆芽馅）” → “菜煎饼” */
export function shortName(text: string): string {
  const name = text.trim();
  if (name.length <= 14) return name;
  const trimmed = name.replace(/[（(](?!疑似)[^）)]*[）)]/g, "").trim();
  return (trimmed || name).slice(0, 30);
}
