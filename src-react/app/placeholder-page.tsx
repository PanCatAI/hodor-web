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
      <a
        href="#/projects"
        className="mt-8 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        返回项目列表
      </a>
    </section>
  );
}
