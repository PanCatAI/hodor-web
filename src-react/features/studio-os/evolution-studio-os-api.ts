/** HTTP client for the global professional-creation evaluation console. */
import {
  databaseRecordIdFor,
  evidenceHttpPath,
  type StudioOsAttestations,
  type StudioOsEvidenceList,
  type StudioOsEvidenceReadback,
  type StudioOsEvidenceRecord,
  type StudioOsPackageReadback,
  type StudioOsRollbackReceipt,
  type StudioOsRollbackState,
  type StudioOsRunCreate,
} from "./types";

export interface EvolutionStudioOsTransport {
  request(path: string, init?: RequestInit): Promise<unknown>;
}

export interface EvolutionStudioOsAinovelCheckPayload {
  referenceCorpusRefs?: string[];
  referenceTokensSha256?: string[];
}

export interface EvolutionStudioOsApi {
  listEvidence(): Promise<StudioOsEvidenceList>;
  readEvidence(evidenceId: string): Promise<{ evidenceId: string; httpPath: string; record: StudioOsEvidenceRecord }>;
  createRun(input?: { runId?: string; requestSeed?: string }): Promise<StudioOsRunCreate>;
  readDomains(): Promise<{ domains: string[] }>;
  readPackage(): Promise<StudioOsPackageReadback>;
  readRollback(): Promise<StudioOsRollbackReceipt>;
  readRollbackState(): Promise<StudioOsRollbackState>;
  readAttestations(): Promise<StudioOsAttestations>;
  readEvidenceReadback(): Promise<StudioOsEvidenceReadback>;
  readAinovelCapabilityBoundary(): Promise<Record<string, unknown>>;
  checkAinovelOriginality(payload: EvolutionStudioOsAinovelCheckPayload): Promise<Record<string, unknown>>;
}

function post(body?: unknown): RequestInit {
  return { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
}

interface EvidenceReadbackEnvelope {
  record: StudioOsEvidenceRecord;
}

interface DomainsReadback {
  domains: string[];
}

export function createEvolutionStudioOsApi(transport: EvolutionStudioOsTransport): EvolutionStudioOsApi {
  return {
    async listEvidence() {
      return (await transport.request("/api/evolution/evidence")) as StudioOsEvidenceList;
    },
    async readEvidence(evidenceId) {
      const envelope = (await transport.request(
        `/api/evolution/evidence/${encodeURIComponent(evidenceId)}`,
      )) as EvidenceReadbackEnvelope;
      return { evidenceId, httpPath: evidenceHttpPath(evidenceId), record: envelope.record };
    },
    async createRun(input = {}) {
      return (await transport.request("/api/evolution/runs", post(input))) as StudioOsRunCreate;
    },
    async readDomains() {
      const readback = (await transport.request("/api/evolution/domains")) as DomainsReadback;
      return { domains: readback.domains };
    },
    async readPackage() {
      return (await transport.request("/api/evolution/package")) as StudioOsPackageReadback;
    },
    async readRollback() {
      return (await transport.request("/api/evolution/rollback", post())) as StudioOsRollbackReceipt;
    },
    async readRollbackState() {
      return (await transport.request("/api/evolution/rollback/readback")) as StudioOsRollbackState;
    },
    async readAttestations() {
      return (await transport.request("/api/evolution/attestations")) as StudioOsAttestations;
    },
    async readEvidenceReadback() {
      return (await transport.request("/api/evolution/evidence-readback")) as StudioOsEvidenceReadback;
    },
    async readAinovelCapabilityBoundary() {
      return (await transport.request("/api/evolution/ainovel/capability-boundary")) as Record<string, unknown>;
    },
    async checkAinovelOriginality(payload) {
      return (await transport.request("/api/evolution/ainovel/check", post(payload))) as Record<string, unknown>;
    },
  };
}

export function canonicalEvolutionEvidenceBinding(evidenceId: string): { httpPath: string; databaseRecordId: string } {
  return { httpPath: evidenceHttpPath(evidenceId), databaseRecordId: databaseRecordIdFor(evidenceId) };
}
