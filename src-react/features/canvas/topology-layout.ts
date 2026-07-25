export interface TopologyNodeSize {
  width: number;
  height: number;
}

export interface TopologyEdge {
  source: string;
  target: string;
}

export interface TopologyLevelLayoutOptions {
  nodeIds: readonly string[];
  edges: readonly TopologyEdge[];
  nodeSizes?: Record<string, Partial<TopologyNodeSize> | undefined>;
  underSourceNodeIds?: readonly string[];
  gap?: number;
  fallbackNodeSize?: TopologyNodeSize;
}

function positive(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function overlaps(
  first: { x: number; y: number },
  firstSize: TopologyNodeSize,
  second: { x: number; y: number },
  secondSize: TopologyNodeSize,
) {
  return (
    first.x < second.x + secondSize.width &&
    first.x + firstSize.width > second.x &&
    first.y < second.y + secondSize.height &&
    first.y + firstSize.height > second.y
  );
}

export function topologyLevelLayout({
  nodeIds,
  edges,
  nodeSizes = {},
  underSourceNodeIds = [],
  gap: requestedGap = 80,
  fallbackNodeSize = { width: 150, height: 50 },
}: TopologyLevelLayoutOptions): Record<string, { x: number; y: number }> {
  const ids = [...new Set(nodeIds)];
  const idSet = new Set(ids);
  const order = new Map(ids.map((id, index) => [id, index]));
  const gap = positive(requestedGap, 80);
  const sizes = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        width: positive(nodeSizes[id]?.width, fallbackNodeSize.width),
        height: positive(nodeSizes[id]?.height, fallbackNodeSize.height),
      },
    ]),
  ) as Record<string, TopologyNodeSize>;
  const validEdges = edges.filter((edge) => idSet.has(edge.source) && idSet.has(edge.target) && edge.source !== edge.target);
  const adjacency = new Map(ids.map((id) => [id, [] as string[]]));
  const indegree = new Map(ids.map((id) => [id, 0]));
  const incoming = new Map<string, string[]>();
  for (const edge of validEdges) {
    adjacency.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
  }

  const rank = new Map(ids.map((id) => [id, 0]));
  const queue = ids.filter((id) => indegree.get(id) === 0);
  const visited = new Set<string>();
  while (queue.length) {
    queue.sort((first, second) => (order.get(first) ?? 0) - (order.get(second) ?? 0));
    const source = queue.shift()!;
    visited.add(source);
    for (const target of adjacency.get(source) ?? []) {
      rank.set(target, Math.max(rank.get(target) ?? 0, (rank.get(source) ?? 0) + 1));
      indegree.set(target, (indegree.get(target) ?? 1) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }
  let cycleRank = Math.max(0, ...rank.values());
  for (const id of ids) {
    if (visited.has(id)) continue;
    cycleRank += 1;
    rank.set(id, cycleRank);
  }

  const underSource = new Set(underSourceNodeIds.filter((id) => idSet.has(id)));
  const standardIds = ids.filter((id) => !underSource.has(id));
  const rankValues = [...new Set(standardIds.map((id) => rank.get(id) ?? 0))].sort((first, second) => first - second);
  const rankX = new Map<number, number>();
  let cursorX = 0;
  for (const rankValue of rankValues) {
    rankX.set(rankValue, cursorX);
    const levelWidths = standardIds.filter((id) => rank.get(id) === rankValue).map((id) => sizes[id].width);
    cursorX += (levelWidths.length ? Math.max(...levelWidths) : fallbackNodeSize.width) + gap;
  }

  const layout: Record<string, { x: number; y: number }> = {};
  for (const rankValue of rankValues) {
    let cursorY = 0;
    for (const id of standardIds.filter((candidate) => rank.get(candidate) === rankValue)) {
      layout[id] = { x: rankX.get(rankValue) ?? 0, y: cursorY };
      cursorY += sizes[id].height + gap;
    }
  }

  const branchBottom = new Map<string, number>();
  for (const id of ids.filter((candidate) => underSource.has(candidate))) {
    const source = (incoming.get(id) ?? []).sort((first, second) => (order.get(first) ?? 0) - (order.get(second) ?? 0))[0];
    const sourcePosition = source ? layout[source] : undefined;
    const x = sourcePosition?.x ?? 0;
    const defaultY = source && sourcePosition ? sourcePosition.y + sizes[source].height + gap : 0;
    const y = Math.max(defaultY, branchBottom.get(source ?? "") ?? 0);
    layout[id] = { x, y };
    branchBottom.set(source ?? "", y + sizes[id].height + gap);
  }

  for (const branchId of ids.filter((id) => underSource.has(id))) {
    for (const standardId of standardIds) {
      if (!overlaps(layout[branchId], sizes[branchId], layout[standardId], sizes[standardId])) continue;
      const collidedRank = rank.get(standardId) ?? 0;
      const shift = layout[branchId].x + sizes[branchId].width + gap - layout[standardId].x;
      if (shift <= 0) continue;
      for (const id of standardIds) {
        if ((rank.get(id) ?? 0) >= collidedRank) layout[id] = { ...layout[id], x: layout[id].x + shift };
      }
      break;
    }
  }

  return Object.fromEntries(ids.map((id) => [id, layout[id] ?? { x: 0, y: 0 }]));
}
