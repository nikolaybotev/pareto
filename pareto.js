'use strict';

// CLI front end for ledger.js. The books live in SQLite. The router moves
// one full amount along one path; it does not divide a payment.

const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const {
  dollarsToCents,
  formatGroupedCents,
  createLedger,
  openLedger,
  loadBooks,
  demoBooks,
  buildDemoReport,
  defaultRails,
  routeLiquidity,
  referenceRouteRequest,
  vendorExposure,
  projectRunway,
} = require('./ledger.js');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const command = argv[0];
  if (!command || command.startsWith('-')) return { command: undefined, opts: {} };
  const opts = {};
  const lines = [];
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--json') {
      if (opts.json) fail('duplicate argument: --json');
      opts.json = true;
      continue;
    }
    if (token === '--line') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('-')) fail('missing value for --line');
      lines.push(value);
      i += 1;
      continue;
    }
    const valued = ['--db', '--date', '--description', '--account', '--from', '--to', '--amount', '--start', '--deadline'];
    if (!valued.includes(token)) fail(`unknown argument: ${token}`);
    if (opts[token]) fail(`duplicate argument: ${token}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('-')) fail(`missing value for ${token}`);
    opts[token] = value;
    i += 1;
  }
  opts.lines = lines;
  return { command, opts };
}

function openDatabase(path, create) {
  if (!path) fail('missing required argument: --db');
  if (create && path !== ':memory:' && fs.existsSync(path)) fail(`database already exists: ${path}`);
  if (!create && path !== ':memory:' && !fs.existsSync(path)) fail(`database not found: ${path}`);
  const db = new DatabaseSync(path);
  return create ? createLedger(db) : openLedger(db);
}

function printTrialBalance(rows) {
  let debits = 0;
  let credits = 0;
  const lines = ['Account | Debit | Credit'];
  for (const row of rows) {
    debits += row.debitCents;
    credits += row.creditCents;
    lines.push(`${row.code} ${row.name} | ${formatGroupedCents(row.debitCents)} | ${formatGroupedCents(row.creditCents)}`);
  }
  lines.push(`Total | ${formatGroupedCents(debits)} | ${formatGroupedCents(credits)}`);
  lines.push(debits === credits ? 'Books balance.' : 'Books do not balance.');
  process.stdout.write(`${lines.join('\n')}\n`);
}

function printObligations(obligations) {
  const lines = ['Vendor | Milestone | Due | Account | Remaining | Status'];
  for (const row of obligations) {
    if (row.status === 'CLEARED') continue;
    lines.push([
      row.vendor,
      row.milestone,
      row.effectiveDate,
      row.targetAccount,
      formatGroupedCents(row.amountCents),
      row.status,
    ].join(' | '));
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

function printRunway(runway) {
  const lines = ['Date | Change | Balance | Label'];
  for (const row of runway.rows) {
    lines.push(`${row.date} | ${formatGroupedCents(row.deltaCents)} | ${formatGroupedCents(row.balanceCents)} | ${row.label}`);
  }
  lines.push(runway.deficitDate ? `Deficit date: ${runway.deficitDate}` : 'No deficit on this runway.');
  process.stdout.write(`${lines.join('\n')}\n`);
}

function printRoutes(routes) {
  if (routes.length === 0) {
    process.stdout.write('No route moves the full amount to the target.\n');
    return;
  }
  const lines = [];
  routes.forEach((route, index) => {
    const path = route.hops.map((hop) => `${hop.rail} ${hop.src}->${hop.dst}`).join(', ');
    lines.push(
      `${index + 1}. ${route.onTime ? 'On time' : 'Late'} ${formatGroupedCents(route.totalCostCents)} `
      + `fee ${formatGroupedCents(route.railFeeCents)} arrives ${route.arrival}: ${path}`,
    );
  });
  process.stdout.write(`${lines.join('\n')}\n`);
}

function publicRoute(route) {
  return {
    on_time: route.onTime,
    arrival: route.arrival,
    total_cost_cents: route.totalCostCents,
    rail_fee_cents: route.railFeeCents,
    lost_interest_cents: route.lostInterestCents,
    delay_penalty_cents: route.delayPenaltyCents,
    risk_premium_cents: route.riskPremiumCents,
    hops: route.hops.map((hop) => ({
      rail: hop.rail,
      src: hop.src,
      dst: hop.dst,
      arrival: hop.arrival,
      fee_cents: hop.feeCents,
    })),
  };
}

function publicObligation(row) {
  return {
    aggregate_id: row.aggregateId,
    vendor: row.vendor,
    milestone: row.milestone,
    contract_ref: row.contractRef,
    status: row.status,
    effective_date: row.effectiveDate,
    target_account: row.targetAccount,
    amount_cents: row.amountCents,
  };
}

function reportJson(report) {
  return {
    as_of: report.asOf,
    balanced: report.debitTotalCents === report.creditTotalCents,
    debit_total_cents: report.debitTotalCents,
    credit_total_cents: report.creditTotalCents,
    trial_balance: report.trialBalance.map((row) => ({
      code: row.code,
      name: row.name,
      type: row.type,
      balance_cents: row.balanceCents,
      debit_cents: row.debitCents,
      credit_cents: row.creditCents,
    })),
    obligations: report.obligations.map(publicObligation),
    vendor_exposure: report.vendorExposure.map((row) => ({
      vendor: row.vendor,
      committed_cents: row.committedCents,
      billed_cents: row.billedCents,
      total_cents: row.totalCents,
    })),
    runway: Object.fromEntries(Object.entries(report.runway).map(([code, runway]) => [code, {
      deficit_date: runway.deficitDate,
      rows: runway.rows.map((row) => ({
        date: row.date,
        label: row.label,
        delta_cents: row.deltaCents,
        balance_cents: row.balanceCents,
      })),
    }])),
    route: {
      amount_cents: report.referenceRoute.request.amountCents,
      source: report.referenceRoute.request.source,
      target: report.referenceRoute.request.target,
      start: report.referenceRoute.request.start,
      deadline: report.referenceRoute.request.deadline,
      routes: report.referenceRoute.routes.map(publicRoute),
    },
  };
}

function printDemo(report) {
  process.stdout.write('Trial balance\n');
  printTrialBalance(report.trialBalance);
  process.stdout.write('\nOpen obligations\n');
  printObligations(report.obligations);
  process.stdout.write('\nProject checking runway\n');
  printRunway(report.runway.CHK_PROJ);
  const chosen = report.referenceRoute.routes[0];
  process.stdout.write('\nReference route\n');
  if (!chosen) {
    process.stdout.write('No route.\n');
    return;
  }
  process.stdout.write(
    `${formatGroupedCents(report.referenceRoute.request.amountCents)} ${report.referenceRoute.request.source} -> ${report.referenceRoute.request.target} `
    + `by ${report.referenceRoute.request.deadline}: ${chosen.hops.map((hop) => hop.rail).join(' then ')} `
    + `arrives ${chosen.arrival}, cost ${formatGroupedCents(chosen.totalCostCents)}.\n`,
  );
}

function parseLine(text) {
  const match = /^([A-Z][A-Z0-9_]{0,31}):(debit|credit):(\d+(?:\.\d{1,2})?)$/.exec(text);
  if (!match) fail(`invalid --line: ${text}`);
  const amount = dollarsToCents(match[3]);
  if (amount <= 0) fail(`invalid --line: ${text}`);
  return {
    accountCode: match[1],
    amountCents: match[2] === 'debit' ? amount : -amount,
  };
}

function requireRoute(opts) {
  if (!opts['--from'] || !opts['--to'] || !opts['--amount'] || !opts['--start'] || !opts['--deadline']) {
    fail('missing required argument: --from, --to, --amount, --start, and --deadline');
  }
  let amountCents;
  try {
    amountCents = dollarsToCents(opts['--amount']);
  } catch (error) {
    fail(`invalid --amount: ${error.message}`);
  }
  if (amountCents <= 0) fail('invalid --amount: amount must be greater than zero');
  return {
    source: opts['--from'],
    target: opts['--to'],
    amountCents,
    start: opts['--start'],
    deadline: opts['--deadline'],
    latePenaltyCents: 20000,
    perDiemCents: 5000,
    annualYieldBps: 450,
    breachLossCents: 100000,
  };
}

function runwayFromLedger(ledger, account) {
  const balance = ledger.balanceOf(account);
  if (balance === null) fail(`unknown account: ${account}`);
  const flows = ledger.obligations()
    .filter((obligation) => obligation.status !== 'CLEARED' && obligation.targetAccount === account)
    .map((obligation) => ({
      date: obligation.effectiveDate,
      deltaCents: obligation.amountCents,
      label: `${obligation.vendor || 'Obligation'}: ${obligation.milestone || obligation.aggregateId}`,
    }));
  return projectRunway(balance, ledger.asOf() || 'opening', flows);
}

function runCli(argv) {
  const { command, opts } = parseArgs(argv);
  if (!command) {
    fail('missing command: init, demo, trial-balance, post, obligations, runway, or route');
  }
  if (command === 'init') {
    openDatabase(opts['--db'], true);
    process.stdout.write(`Created ${opts['--db']}\n`);
    return;
  }
  if (command === 'demo') {
    if (opts['--db']) {
      const ledger = openDatabase(opts['--db'], true);
      loadBooks(ledger, demoBooks());
    }
    const report = buildDemoReport();
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(reportJson(report))}\n`);
      return;
    }
    printDemo(report);
    return;
  }
  if (command === 'trial-balance') {
    const ledger = openDatabase(opts['--db'], false);
    const rows = ledger.trialBalance();
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(rows)}\n`);
      return;
    }
    printTrialBalance(rows);
    return;
  }
  if (command === 'post') {
    if (!opts['--date'] || !opts['--description'] || opts.lines.length < 2) {
      fail('missing required argument: --db, --date, --description, and at least two --line values');
    }
    const ledger = openDatabase(opts['--db'], false);
    const entryId = ledger.postEntry({
      entryDate: opts['--date'],
      description: opts['--description'],
      lines: opts.lines.map(parseLine),
    });
    process.stdout.write(`Posted entry ${entryId}\n`);
    return;
  }
  if (command === 'obligations') {
    const ledger = openDatabase(opts['--db'], false);
    const rows = ledger.obligations();
    if (opts.json) {
      process.stdout.write(`${JSON.stringify({ obligations: rows.map(publicObligation), exposure: vendorExposure(rows) })}\n`);
      return;
    }
    printObligations(rows);
    return;
  }
  if (command === 'runway') {
    if (!opts['--account']) fail('missing required argument: --account');
    const ledger = openDatabase(opts['--db'], false);
    const runway = runwayFromLedger(ledger, opts['--account']);
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(runway)}\n`);
      return;
    }
    printRunway(runway);
    return;
  }
  if (command === 'route') {
    const request = requireRoute(opts);
    if (opts['--db']) {
      const ledger = openDatabase(opts['--db'], false);
      const balance = ledger.balanceOf(request.source);
      if (balance !== null && balance < request.amountCents) {
        fail(`${request.source} balance ${formatGroupedCents(balance)} is below ${formatGroupedCents(request.amountCents)}`);
      }
    }
    let routes;
    try {
      routes = routeLiquidity(defaultRails(), request);
    } catch (error) {
      fail(error.message);
    }
    if (opts.json) {
      process.stdout.write(`${JSON.stringify({
        amount_cents: request.amountCents,
        source: request.source,
        target: request.target,
        start: request.start,
        deadline: request.deadline,
        routes: routes.map(publicRoute),
      })}\n`);
      return;
    }
    printRoutes(routes);
    return;
  }
  fail(`unknown command: ${command}`);
}

function main() {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    fail(error && error.message ? error.message : String(error));
  }
}

if (require.main === module) main();

module.exports = { runCli, reportJson };
