import { mkdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { dirname } from "node:path";

import type { GraphBuild, GraphEdge, GraphEvidence, GraphExplanation, GraphNode } from "./types.js";
import {
  RepositoryGraphStoreError,
  type GraphNeighborQuery,
  type GraphPathQuery,
  type GraphPathResult,
  type GraphRelationshipExplanationQuery,
  type GraphStore,
  type GraphTraversalQuery,
  type GraphTraversalResult,
  type RepositoryGraphStorePaths
} from "./graph-store.js";

const graphSchemaVersion = 1;

export function createSqliteRepositoryGraphStore(paths: RepositoryGraphStorePaths): GraphStore {
  let db: DatabaseSync | undefined;

  const open = () => {
    db ??= new DatabaseSync(paths.sqlitePath);
    return db;
  };

  return {
    paths,
    ensure: async () => {
      try {
        await mkdir(dirname(paths.sqlitePath), { recursive: true });
        await mkdir(paths.snapshotsRoot, { recursive: true });
        const database = open();

        database.exec(`
          PRAGMA journal_mode = WAL;
          CREATE TABLE IF NOT EXISTS graph_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS graph_builds (
            id TEXT PRIMARY KEY,
            repository_root TEXT NOT NULL,
            repository_state_root TEXT,
            commit_sha TEXT,
            scanner_fingerprint TEXT,
            contract_path TEXT,
            contract_version TEXT,
            built_at TEXT NOT NULL,
            invalidation_state_json TEXT,
            summary_json TEXT,
            metadata_json TEXT
          );
          CREATE TABLE IF NOT EXISTS graph_nodes (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            key TEXT NOT NULL,
            label TEXT NOT NULL,
            path TEXT,
            parent_id TEXT,
            evidence_ids_json TEXT NOT NULL,
            first_observed_build_id TEXT NOT NULL,
            last_observed_build_id TEXT NOT NULL,
            metadata_json TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_graph_nodes_kind ON graph_nodes(kind);
          CREATE INDEX IF NOT EXISTS idx_graph_nodes_path ON graph_nodes(path);
          CREATE TABLE IF NOT EXISTS graph_edges (
            id TEXT PRIMARY KEY,
            source_node_id TEXT NOT NULL,
            target_node_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            confidence TEXT NOT NULL,
            evidence_ids_json TEXT NOT NULL,
            extractor_id TEXT NOT NULL,
            first_observed_build_id TEXT NOT NULL,
            last_observed_build_id TEXT NOT NULL,
            metadata_json TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_node_id);
          CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_node_id);
          CREATE INDEX IF NOT EXISTS idx_graph_edges_kind ON graph_edges(kind);
          CREATE TABLE IF NOT EXISTS graph_evidence (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            summary TEXT NOT NULL,
            source_location_json TEXT,
            scanner_fact_id TEXT,
            contract_path TEXT,
            verification_run_id TEXT,
            verification_check_id TEXT,
            doctor_record_kind TEXT,
            doctor_record_id TEXT,
            command_source TEXT,
            ci_job_name TEXT,
            metadata_json TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_graph_evidence_kind ON graph_evidence(kind);
        `);
        database
          .prepare(
            `
            INSERT INTO graph_metadata(key, value)
            VALUES ('schema_version', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
          `
          )
          .run(String(graphSchemaVersion));
      } catch (error) {
        throw new RepositoryGraphStoreError(
          "store-write-failed",
          `Failed to initialize repository graph store: ${formatError(error)}`,
          paths.sqlitePath
        );
      }
    },
    clear: async () => {
      try {
        const database = open();
        database.exec(`
          DELETE FROM graph_builds;
          DELETE FROM graph_nodes;
          DELETE FROM graph_edges;
          DELETE FROM graph_evidence;
          DELETE FROM graph_metadata WHERE key = 'latest_build_id';
        `);
      } catch (error) {
        throw new RepositoryGraphStoreError(
          "store-write-failed",
          `Failed to clear repository graph store: ${formatError(error)}`,
          paths.sqlitePath
        );
      }
    },
    replaceGraph: async (snapshot) => {
      try {
        const database = open();
        database.exec("BEGIN");
        database.exec(`
          DELETE FROM graph_builds;
          DELETE FROM graph_nodes;
          DELETE FROM graph_edges;
          DELETE FROM graph_evidence;
        `);
        insertBuild(database, snapshot.build);
        insertNodes(database, snapshot.nodes);
        insertEdges(database, snapshot.edges);
        insertEvidence(database, snapshot.evidence);
        database
          .prepare(
            `
            INSERT INTO graph_metadata(key, value)
            VALUES ('latest_build_id', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
          `
          )
          .run(snapshot.build.id);
        database.exec("COMMIT");
        return snapshot;
      } catch (error) {
        safeRollback(open());
        throw new RepositoryGraphStoreError(
          "store-write-failed",
          `Failed to replace repository graph snapshot: ${formatError(error)}`,
          paths.sqlitePath
        );
      }
    },
    getBuild: async (buildId) => {
      try {
        const row = open().prepare("SELECT * FROM graph_builds WHERE id = ?").get(buildId) as
          Record<string, unknown> | undefined;
        return row === undefined ? undefined : hydrateBuild(row);
      } catch (error) {
        throw new RepositoryGraphStoreError(
          "store-read-failed",
          `Failed to read repository graph build: ${formatError(error)}`,
          paths.sqlitePath
        );
      }
    },
    getLatestBuild: async () => {
      try {
        const latest = open()
          .prepare("SELECT value FROM graph_metadata WHERE key = 'latest_build_id'")
          .get() as { value?: string } | undefined;
        return latest?.value === undefined
          ? undefined
          : await thisStore(paths).getBuild(latest.value);
      } catch (error) {
        throw new RepositoryGraphStoreError(
          "store-read-failed",
          `Failed to read latest repository graph build: ${formatError(error)}`,
          paths.sqlitePath
        );
      }
    },
    getNode: async (nodeId) => {
      try {
        const row = open().prepare("SELECT * FROM graph_nodes WHERE id = ?").get(nodeId) as
          Record<string, unknown> | undefined;
        return row === undefined ? undefined : hydrateNode(row);
      } catch (error) {
        throw new RepositoryGraphStoreError(
          "store-read-failed",
          `Failed to read repository graph node: ${formatError(error)}`,
          paths.sqlitePath
        );
      }
    },
    getNodesByKind: async (kind) => {
      try {
        return (
          open()
            .prepare("SELECT * FROM graph_nodes WHERE kind = ? ORDER BY id")
            .all(kind) as Record<string, unknown>[]
        ).map(hydrateNode);
      } catch (error) {
        throw new RepositoryGraphStoreError(
          "store-read-failed",
          `Failed to list repository graph nodes by kind: ${formatError(error)}`,
          paths.sqlitePath
        );
      }
    },
    getNeighbors: async (query) => {
      const edges = await selectNeighborEdges(open(), query);
      const nodeIds = new Set<string>();

      for (const edge of edges) {
        if (edge.sourceNodeId === query.nodeId) {
          nodeIds.add(edge.targetNodeId);
        }
        if (edge.targetNodeId === query.nodeId) {
          nodeIds.add(edge.sourceNodeId);
        }
      }

      return [...nodeIds].map((id) => thisStore(paths).getNode(id)).length > 0
        ? (await Promise.all([...nodeIds].map((id) => thisStore(paths).getNode(id)))).flatMap(
            (node) => (node === undefined ? [] : [node])
          )
        : [];
    },
    traverse: async (query) => traverseSqlite(open(), paths, query),
    findPath: async (query) => findPathSqlite(open(), paths, query),
    getEvidence: async (evidenceIds) => {
      if (evidenceIds.length === 0) {
        return [];
      }

      try {
        const placeholders = evidenceIds.map(() => "?").join(", ");
        return (
          open()
            .prepare(`SELECT * FROM graph_evidence WHERE id IN (${placeholders}) ORDER BY id`)
            .all(...evidenceIds) as Record<string, unknown>[]
        ).map(hydrateEvidence);
      } catch (error) {
        throw new RepositoryGraphStoreError(
          "store-read-failed",
          `Failed to read repository graph evidence: ${formatError(error)}`,
          paths.sqlitePath
        );
      }
    },
    explainRelationship: async (query) => explainRelationshipSqlite(open(), paths, query)
  };
}

function thisStore(paths: RepositoryGraphStorePaths): GraphStore {
  return createSqliteRepositoryGraphStore(paths);
}

function insertBuild(database: DatabaseSync, build: GraphBuild): void {
  database
    .prepare(
      `
      INSERT INTO graph_builds(
        id,
        repository_root,
        repository_state_root,
        commit_sha,
        scanner_fingerprint,
        contract_path,
        contract_version,
        built_at,
        invalidation_state_json,
        summary_json,
        metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      build.id,
      build.repositoryRoot,
      build.repositoryStateRoot ?? null,
      build.commitSha ?? null,
      build.scannerFingerprint ?? null,
      build.contractPath ?? null,
      build.contractVersion ?? null,
      build.builtAt,
      stringifyNullable(build.invalidationState),
      stringifyNullable(build.summary),
      stringifyNullable(build.metadata)
    );
}

function insertNodes(database: DatabaseSync, nodes: readonly GraphNode[]): void {
  const statement = database.prepare(`
    INSERT INTO graph_nodes(
      id,
      kind,
      key,
      label,
      path,
      parent_id,
      evidence_ids_json,
      first_observed_build_id,
      last_observed_build_id,
      metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const node of nodes) {
    statement.run(
      node.id,
      node.kind,
      node.key,
      node.label,
      node.path ?? null,
      node.parentId ?? null,
      JSON.stringify(node.evidenceIds),
      node.firstObservedBuildId,
      node.lastObservedBuildId,
      stringifyNullable(node.metadata)
    );
  }
}

function insertEdges(database: DatabaseSync, edges: readonly GraphEdge[]): void {
  const statement = database.prepare(`
    INSERT INTO graph_edges(
      id,
      source_node_id,
      target_node_id,
      kind,
      confidence,
      evidence_ids_json,
      extractor_id,
      first_observed_build_id,
      last_observed_build_id,
      metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const edge of edges) {
    statement.run(
      edge.id,
      edge.sourceNodeId,
      edge.targetNodeId,
      edge.kind,
      edge.confidence,
      JSON.stringify(edge.evidenceIds),
      edge.extractorId,
      edge.firstObservedBuildId,
      edge.lastObservedBuildId,
      stringifyNullable(edge.metadata)
    );
  }
}

function insertEvidence(database: DatabaseSync, evidence: readonly GraphEvidence[]): void {
  const statement = database.prepare(`
    INSERT INTO graph_evidence(
      id,
      kind,
      summary,
      source_location_json,
      scanner_fact_id,
      contract_path,
      verification_run_id,
      verification_check_id,
      doctor_record_kind,
      doctor_record_id,
      command_source,
      ci_job_name,
      metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const entry of evidence) {
    statement.run(
      entry.id,
      entry.kind,
      entry.summary,
      stringifyNullable(entry.sourceLocation),
      entry.scannerFactId ?? null,
      entry.contractPath ?? null,
      entry.verificationRunId ?? null,
      entry.verificationCheckId ?? null,
      entry.doctorRecordKind ?? null,
      entry.doctorRecordId ?? null,
      entry.commandSource ?? null,
      entry.ciJobName ?? null,
      stringifyNullable(entry.metadata)
    );
  }
}

function hydrateBuild(row: Record<string, unknown>): GraphBuild {
  return {
    id: String(row.id),
    repositoryRoot: String(row.repository_root),
    repositoryStateRoot: nullableString(row.repository_state_root),
    commitSha: nullableString(row.commit_sha),
    scannerFingerprint: nullableString(row.scanner_fingerprint),
    contractPath: nullableString(row.contract_path),
    contractVersion: nullableString(row.contract_version),
    builtAt: String(row.built_at),
    invalidationState: parseNullableRecord(row.invalidation_state_json),
    summary: parseNullableObject(row.summary_json),
    metadata: parseNullableRecord(row.metadata_json)
  };
}

function hydrateNode(row: Record<string, unknown>): GraphNode {
  return {
    id: String(row.id),
    kind: row.kind as GraphNode["kind"],
    key: String(row.key),
    label: String(row.label),
    path: nullableString(row.path),
    parentId: nullableString(row.parent_id),
    evidenceIds: JSON.parse(String(row.evidence_ids_json)) as readonly string[],
    firstObservedBuildId: String(row.first_observed_build_id),
    lastObservedBuildId: String(row.last_observed_build_id),
    metadata: parseNullableRecord(row.metadata_json)
  };
}

function hydrateEdge(row: Record<string, unknown>): GraphEdge {
  return {
    id: String(row.id),
    sourceNodeId: String(row.source_node_id),
    targetNodeId: String(row.target_node_id),
    kind: row.kind as GraphEdge["kind"],
    confidence: row.confidence as GraphEdge["confidence"],
    evidenceIds: JSON.parse(String(row.evidence_ids_json)) as readonly string[],
    extractorId: String(row.extractor_id),
    firstObservedBuildId: String(row.first_observed_build_id),
    lastObservedBuildId: String(row.last_observed_build_id),
    metadata: parseNullableRecord(row.metadata_json)
  };
}

function hydrateEvidence(row: Record<string, unknown>): GraphEvidence {
  return {
    id: String(row.id),
    kind: row.kind as GraphEvidence["kind"],
    summary: String(row.summary),
    sourceLocation: parseNullableObject(row.source_location_json),
    scannerFactId: nullableString(row.scanner_fact_id),
    contractPath: nullableString(row.contract_path),
    verificationRunId: nullableString(row.verification_run_id),
    verificationCheckId: nullableString(row.verification_check_id),
    doctorRecordKind:
      row.doctor_record_kind === null || row.doctor_record_kind === undefined
        ? undefined
        : (row.doctor_record_kind as GraphEvidence["doctorRecordKind"]),
    doctorRecordId: nullableString(row.doctor_record_id),
    commandSource: nullableString(row.command_source),
    ciJobName: nullableString(row.ci_job_name),
    metadata: parseNullableRecord(row.metadata_json)
  };
}

function selectNeighborEdges(
  database: DatabaseSync,
  query: GraphNeighborQuery
): readonly GraphEdge[] {
  const direction = query.direction ?? "both";
  const kindFilter =
    (query.edgeKinds?.length ?? 0) > 0
      ? ` AND kind IN (${query.edgeKinds!.map(() => "?").join(", ")})`
      : "";

  let sql = "SELECT * FROM graph_edges WHERE ";
  const params: readonly string[] =
    direction === "outgoing"
      ? [query.nodeId, ...(query.edgeKinds ?? [])]
      : direction === "incoming"
        ? [query.nodeId, ...(query.edgeKinds ?? [])]
        : [query.nodeId, query.nodeId, ...(query.edgeKinds ?? [])];

  if (direction === "outgoing") {
    sql += "source_node_id = ?" + kindFilter + " ORDER BY id";
  } else if (direction === "incoming") {
    sql += "target_node_id = ?" + kindFilter + " ORDER BY id";
  } else {
    sql += "(source_node_id = ? OR target_node_id = ?)" + kindFilter + " ORDER BY id";
  }

  return (database.prepare(sql).all(...params) as Record<string, unknown>[]).map(hydrateEdge);
}

async function traverseSqlite(
  database: DatabaseSync,
  paths: RepositoryGraphStorePaths,
  query: GraphTraversalQuery
): Promise<GraphTraversalResult> {
  const store = createSqliteRepositoryGraphStore(paths);
  const maxDepth = query.maxDepth ?? 3;
  const visitedNodes = new Set<string>([query.startNodeId]);
  const visitedEdges = new Set<string>();
  const queue = [{ nodeId: query.startNodeId, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();

    if (current === undefined || current.depth >= maxDepth) {
      continue;
    }

    const edges = selectNeighborEdges(database, {
      nodeId: current.nodeId,
      edgeKinds: query.edgeKinds,
      direction: query.direction
    });

    for (const edge of edges) {
      const nextNodeId =
        edge.sourceNodeId === current.nodeId ? edge.targetNodeId : edge.sourceNodeId;
      visitedEdges.add(edge.id);

      if (!visitedNodes.has(nextNodeId)) {
        visitedNodes.add(nextNodeId);
        queue.push({ nodeId: nextNodeId, depth: current.depth + 1 });
      }
    }
  }

  return {
    nodes: (await Promise.all([...visitedNodes].map((nodeId) => store.getNode(nodeId)))).flatMap(
      (node) => (node === undefined ? [] : [node])
    ),
    edges: [...visitedEdges].flatMap((edgeId) => {
      const row = database.prepare("SELECT * FROM graph_edges WHERE id = ?").get(edgeId) as
        Record<string, unknown> | undefined;
      return row === undefined ? [] : [hydrateEdge(row)];
    })
  };
}

async function findPathSqlite(
  database: DatabaseSync,
  paths: RepositoryGraphStorePaths,
  query: GraphPathQuery
): Promise<GraphPathResult | undefined> {
  const store = createSqliteRepositoryGraphStore(paths);
  const maxDepth = query.maxDepth ?? 6;
  const queue: Array<{
    readonly nodeId: string;
    readonly depth: number;
    readonly pathNodeIds: readonly string[];
    readonly pathEdgeIds: readonly string[];
  }> = [
    {
      nodeId: query.sourceNodeId,
      depth: 0,
      pathNodeIds: [query.sourceNodeId],
      pathEdgeIds: []
    }
  ];
  const seen = new Set<string>([query.sourceNodeId]);

  while (queue.length > 0) {
    const current = queue.shift();

    if (current === undefined || current.depth > maxDepth) {
      continue;
    }
    if (current.nodeId === query.targetNodeId) {
      return {
        nodes: (
          await Promise.all(current.pathNodeIds.map((nodeId) => store.getNode(nodeId)))
        ).flatMap((node) => (node === undefined ? [] : [node])),
        edges: current.pathEdgeIds.flatMap((edgeId) => {
          const row = database.prepare("SELECT * FROM graph_edges WHERE id = ?").get(edgeId) as
            Record<string, unknown> | undefined;
          return row === undefined ? [] : [hydrateEdge(row)];
        })
      };
    }

    const edges = selectNeighborEdges(database, {
      nodeId: current.nodeId,
      edgeKinds: query.edgeKinds,
      direction: query.direction
    });

    for (const edge of edges) {
      const nextNodeId =
        edge.sourceNodeId === current.nodeId ? edge.targetNodeId : edge.sourceNodeId;

      if (seen.has(nextNodeId)) {
        continue;
      }

      seen.add(nextNodeId);
      queue.push({
        nodeId: nextNodeId,
        depth: current.depth + 1,
        pathNodeIds: [...current.pathNodeIds, nextNodeId],
        pathEdgeIds: [...current.pathEdgeIds, edge.id]
      });
    }
  }

  return undefined;
}

async function explainRelationshipSqlite(
  database: DatabaseSync,
  paths: RepositoryGraphStorePaths,
  query: GraphRelationshipExplanationQuery
): Promise<GraphExplanation | undefined> {
  const store = createSqliteRepositoryGraphStore(paths);
  const source = await store.getNode(query.sourceNodeId);
  const target = await store.getNode(query.targetNodeId);

  if (source === undefined || target === undefined) {
    return undefined;
  }

  const relationshipRows = database
    .prepare(
      `
        SELECT * FROM graph_edges
        WHERE source_node_id = ?
          AND target_node_id = ?
          AND (? IS NULL OR kind = ?)
        ORDER BY id
      `
    )
    .all(query.sourceNodeId, query.targetNodeId, query.kind ?? null, query.kind ?? null) as Record<
    string,
    unknown
  >[];
  const relationships = relationshipRows.map(hydrateEdge);

  if (relationships.length === 0) {
    return undefined;
  }

  const evidence = await store.getEvidence(
    [...new Set(relationships.flatMap((edge) => edge.evidenceIds))].sort()
  );

  return {
    target: source,
    relatedNodes: [target],
    relationships,
    evidence,
    summary: `${source.label} -> ${target.label}`,
    warnings: []
  };
}

function safeRollback(database: DatabaseSync | undefined): void {
  try {
    database?.exec("ROLLBACK");
  } catch {
    // Ignore rollback failures after a write error.
  }
}

function stringifyNullable(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function parseNullableObject<T>(value: unknown): T | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return JSON.parse(String(value)) as T;
}

function parseNullableRecord(
  value: unknown
): Readonly<Record<string, string | number | boolean>> | undefined {
  return parseNullableObject<Readonly<Record<string, string | number | boolean>>>(value);
}

function nullableString(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
