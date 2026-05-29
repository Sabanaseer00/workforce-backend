/**
 * CPM + PERT Calculation Engine
 * Input:  Array of task objects (plain JS, not Mongoose docs)
 * Output: Enriched tasks with ES, EF, LS, LF, float, isCritical
 */

// ── PERT ────────────────────────────────────────────────────────────────────
export function pertCalc(o, m, p) {
  if (o == null || m == null || p == null) return null;
  const te       = +((o + 4 * m + p) / 6).toFixed(2);
  const variance = +(((p - o) / 6) ** 2).toFixed(2);
  const sd       = +Math.sqrt(variance).toFixed(2);
  return { te, variance, sd };
}

// ── CPM ────────────────────────────────────────────────────────────────────
/**
 * @param {Array} tasks   — each must have: { _id (string), duration, dependencies: [string] }
 * @returns { tasks: enrichedArray, criticalPath: [id,...], projectDuration: number }
 */
export function computeCPM(tasks) {
  if (!tasks || !tasks.length) {
    return { tasks: [], criticalPath: [], projectDuration: 0 };
  }

  const byId = {};
  tasks.forEach(t => {
    byId[String(t._id)] = {
      ...t,
      _id:  String(t._id),
      deps: (t.dependencies || []).map(String),
      dur:  Number(t.duration) || 1,
      ES: 0, EF: 0, LS: 0, LF: 0, float: 0, isCritical: false,
    };
  });

  const ids = Object.keys(byId);

  // ── Topological sort (Kahn's algorithm) ─────────────────────────────────
  const inDeg = {};
  ids.forEach(id => { inDeg[id] = 0; });
  ids.forEach(id => {
    byId[id].deps.forEach(d => {
      if (byId[d]) inDeg[id] = (inDeg[id] || 0) + 1;
    });
  });

  const queue  = ids.filter(id => inDeg[id] === 0);
  const sorted = [];
  while (queue.length) {
    const cur = queue.shift();
    sorted.push(cur);
    ids.forEach(id => {
      if (byId[id].deps.includes(cur)) {
        inDeg[id]--;
        if (inDeg[id] === 0) queue.push(id);
      }
    });
  }

  // Fallback for cycles — just use original order
  const order = sorted.length === ids.length ? sorted : ids;

  // ── Forward pass — ES & EF ───────────────────────────────────────────────
  order.forEach(id => {
    const node = byId[id];
    if (!node.deps.length) {
      node.ES = 0;
    } else {
      node.ES = Math.max(
        0,
        ...node.deps
          .filter(d => byId[d])
          .map(d => byId[d].EF || 0)
      );
    }
    node.EF = node.ES + node.dur;
  });

  const projectDuration = Math.max(...Object.values(byId).map(n => n.EF || 0), 0);

  // ── Backward pass — LS & LF ─────────────────────────────────────────────
  [...order].reverse().forEach(id => {
    const node = byId[id];
    // Successors: tasks that depend on this one
    const successors = ids.filter(sid => byId[sid].deps.includes(id));
    if (!successors.length) {
      node.LF = projectDuration;
    } else {
      node.LF = Math.min(...successors.map(s => byId[s].LS ?? projectDuration));
    }
    node.LS    = node.LF - node.dur;
    node.float = +(node.LS - node.ES).toFixed(2);
    node.isCritical = node.float <= 0;
  });

  const enriched     = Object.values(byId);
  const criticalPath = enriched.filter(n => n.isCritical).map(n => n._id);

  return {
    tasks: enriched,
    criticalPath,
    projectDuration,
  };
}

/**
 * Merge CPM results back into Mongoose tasks (for DB update)
 * Returns array of { _id, earlyStart, earlyFinish, lateStart, lateFinish, float, isCritical }
 */
export function cpmToDbFields(enrichedTasks) {
  return enrichedTasks.map(t => ({
    _id:         t._id,
    earlyStart:  t.ES,
    earlyFinish: t.EF,
    lateStart:   t.LS,
    lateFinish:  t.LF,
    float:       t.float,
    isCritical:  t.isCritical,
  }));
}

/**
 * Project-level PERT stats (using critical path tasks only)
 */
export function projectPERT(enrichedTasks, criticalPath) {
  const cpTasks = enrichedTasks.filter(t => criticalPath.includes(t._id));

  const totalVariance = cpTasks.reduce((s, t) => {
    const pert = pertCalc(t.pertOptimistic, t.pertMostLikely, t.pertPessimistic);
    return s + (pert ? pert.variance : 0);
  }, 0);

  const expectedDuration = cpTasks.reduce((s, t) => {
    const pert = pertCalc(t.pertOptimistic, t.pertMostLikely, t.pertPessimistic);
    return s + (pert ? pert.te : (t.duration || 1));
  }, 0);

  const sd = +Math.sqrt(totalVariance).toFixed(2);

  return {
    expectedDuration: +expectedDuration.toFixed(1),
    variance:         +totalVariance.toFixed(2),
    sd,
    prob95Range: {
      min: +(expectedDuration - 2 * sd).toFixed(1),
      max: +(expectedDuration + 2 * sd).toFixed(1),
    },
  };
}