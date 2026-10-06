/** 表单类页面在电脑上不需要铺满，居中成一列 */
export function Narrow({ children }: { children: React.ReactNode }) {
  return <div className="lg:mx-auto lg:max-w-xl">{children}</div>;
}
