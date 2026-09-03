import { describe, expect, it } from "vitest";

import { RollbackStatusView } from "./rollback-status";
import { renderStatic, staticText } from "./studio-os-ssr";
import { buildEvidenceRecord, buildMockStudioOsApi, TEST_RUN_ID } from "./studio-os-test-utils";
import { databaseRecordIdFor, evidenceHttpPath, evidenceIdFor } from "./types";

const ROLLBACK_STATE = {
  kind: "readback",
  command: "readback-rollback-state",
  receiptCount: 1,
  receipt: {
    receiptId: "rollback:target-policy-v5",
    idempotencyKey: "rollback:target-policy-v5",
    exactTargetRef: "artifact:target-policy-v5",
    lastKnownGoodRef: "artifact:target-policy-v4",
    restoredContentSha256: "c".repeat(64),
    restorationExact: true,
  },
  exactRestorationToV4: true,
  repeatReturnsSameReceipt: true,
};

describe("RollbackStatusView (non-browser SSR)", () => {
  it("renders the rollback domain evidence bound to its canonical identifier and the idempotent readback state", () => {
    const { api } = buildMockStudioOsApi();
    const domainRecord = buildEvidenceRecord("rollback", { ok: true, appended: true, restorationExact: true, activeStateReadback: { before: { activePolicyRef: "artifact:target-policy-v5" }, after: { activePolicyRef: "artifact:target-policy-v4" } } });
    const html = renderStatic(<RollbackStatusView api={api} domainRecord={domainRecord} initialState={ROLLBACK_STATE} />);

    expect(html).toContain("回滚状态");
    expect(html).toContain("回滚域证据");
    expect(html).toContain(evidenceIdFor(TEST_RUN_ID, "rollback"));
    expect(html).toContain(evidenceHttpPath(evidenceIdFor(TEST_RUN_ID, "rollback")));
    expect(html).toContain(databaseRecordIdFor(evidenceIdFor(TEST_RUN_ID, "rollback")));
    expect(html).toContain("rollback:target-policy-v5");
    expect(html).toContain("artifact:target-policy-v5");
    expect(html).toContain("artifact:target-policy-v4");
    expect(html).toContain("精确恢复至 v4 exactRestorationToV4");
    expect(html).toContain("重复调用同一回执 repeatSameReceipt");
    expect(html).toContain("调用精确回滚");
  });

  it("renders a pending note when no rollback receipt exists", () => {
    const { api } = buildMockStudioOsApi();
    const html = renderStatic(<RollbackStatusView api={api} initialState={{ kind: "readback", command: "readback-rollback-state", receiptCount: 0, receipt: null, exactRestorationToV4: false, repeatReturnsSameReceipt: false }} />);
    expect(staticText(html)).toContain("尚未产生回滚回执。");
  });
});
