import settingStore from "@/stores/setting";
import type { Knex } from "knex";

export default function createKnexProxy(): Knex {
  const { baseUrl } = storeToRefs(settingStore());

  const reqUrl = baseUrl.value + "/plugin/tRPC";
  const token = localStorage.getItem("token");

  function chain(table?: string, steps: any[] = []): Knex.QueryBuilder {
    return new Proxy(() => {}, {
      get(_, prop: string) {
        if (prop === "then" || prop === "catch" || prop === "finally") {
          const p = fetch(reqUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: token ?? "" },
            body: JSON.stringify({ table, chain: steps }),
          }).then(async (r) => {
            const text = await r.text();
            return text ? JSON.parse(text) : null;
          });
          return p[prop].bind(p);
        }
        return (...args: any[]) => chain(table, [...steps, { method: prop, args }]);
      },
    }) as unknown as Knex.QueryBuilder;
  }

  return new Proxy(() => {}, {
    apply(_, __, [table]: [string]) {
      return chain(table);
    },
    get(_, prop: string) {
      if (prop === "raw") {
        return (sql: string, bindings?: readonly Knex.RawBinding[]) => {
          const p = fetch(reqUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: token ?? "" },
            body: JSON.stringify({ raw: { sql, bindings } }),
          }).then(async (r) => {
            const text = await r.text();
            return text ? JSON.parse(text) : null;
          });
          return { then: p.then.bind(p), catch: p.catch.bind(p) };
        };
      }
      return (...args: any[]) => chain(undefined, [{ method: prop, args }]);
    },
  }) as unknown as Knex;
}
