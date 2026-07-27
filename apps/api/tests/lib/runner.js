const cases = [];
const results = [];

export function describe(suite, fn) {
  const suiteCases = [];
  const it = (name, reqIds, fnCase) => {
    const ids = Array.isArray(reqIds) ? reqIds : [reqIds];
    suiteCases.push({ suite, name, reqIds: ids, fn: fnCase });
  };
  fn({ it });
  cases.push(...suiteCases);
}

export async function runAll() {
  console.log(`\n▶ Running ${cases.length} functional cases...\n`);
  for (const c of cases) {
    const label = `[${c.reqIds.join(',')}] ${c.suite} › ${c.name}`;
    const started = Date.now();
    try {
      await c.fn();
      const ms = Date.now() - started;
      results.push({ ...c, ok: true, ms });
      console.log(`  PASS  ${label}  (${ms}ms)`);
    } catch (e) {
      const ms = Date.now() - started;
      results.push({
        ...c,
        ok: false,
        ms,
        error: e.message,
        meta: e.meta || null,
      });
      console.log(`  FAIL  ${label}  (${ms}ms)`);
      console.log(`         → ${e.message}`);
    }
  }
  return summarize();
}

function summarize() {
  const passed = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const byReq = {};
  for (const r of results) {
    for (const id of r.reqIds) {
      if (!byReq[id]) byReq[id] = { pass: 0, fail: 0 };
      if (r.ok) byReq[id].pass += 1;
      else byReq[id].fail += 1;
    }
  }

  console.log('\n════════════════════════════════════════');
  console.log(' Functional Test Report');
  console.log('════════════════════════════════════════');
  console.log(` Total: ${results.length}  Pass: ${passed.length}  Fail: ${failed.length}`);
  console.log('\n By requirement:');
  for (const [id, s] of Object.entries(byReq).sort()) {
    const mark = s.fail ? '✗' : '✓';
    console.log(`  ${mark} ${id}: ${s.pass} pass / ${s.fail} fail`);
  }
  if (failed.length) {
    console.log('\n Failures:');
    failed.forEach((f, i) => {
      console.log(`  ${i + 1}. [${f.reqIds.join(',')}] ${f.suite} › ${f.name}`);
      console.log(`     ${f.error}`);
    });
  }
  console.log('════════════════════════════════════════\n');
  return { results, passed: passed.length, failed: failed.length, byReq };
}

export function getCases() {
  return cases;
}
