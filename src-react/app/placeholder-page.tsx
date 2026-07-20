interface PlaceholderPageProps {
  title: string;
  description: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <section className="mx-auto max-w-7xl px-6 py-8 lg:px-10 lg:py-10">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-blue-400">Hodor Workspace</p>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">{description}</p>
      <div className="mt-8 rounded-xl border border-dashed border-border bg-white/[0.02] px-6 py-14 text-center text-sm text-slate-500">
        页面正在迁移，当前路由和权限合同已经可用。
      </div>
    </section>
  );
}
