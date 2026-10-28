'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const {
  dollarsToCents,
  advanceBusinessDays,
  parseCivil,
  isBankBusinessDay,
  buildDemoReport,
  createLedger,
  demoBooks,
  loadBooks,
  foldObligations,
  routeLiquidity,
  defaultRails,
  referenceRouteRequest,
  projectRunway,
} = require('./ledger.js');
const { runCli } = require('./pareto.js');

function memoryLedger() {
  return createLedger(new DatabaseSync(':memory:'));
}

test('dollars with two decimal places become cents', () => {
  assert.equal(dollarsToCents('8500'), 850000);
  assert.equal(dollarsToCents('10.5'), 1050);
  assert.equal(dollarsToCents('-8.20'), -820);
});

test('an unbalanced journal entry is rejected and leaves no rows', () => {
  const ledger = memoryLedger();
  ledger.addAccount({ code: 'CASH', name: 'Cash', type: 'asset' });
  ledger.addAccount({ code: 'EQUITY', name: 'Equity', type: 'equity' });
  assert.throws(
    () => ledger.postEntry({
      entryDate: '2026-10-28',
      description: 'Broken',
      lines: [
        { accountCode: 'CASH', amountCents: 100 },
        { accountCode: 'EQUITY', amountCents: -50 },
      ],
    }),
    /does not balance/,
  );
  assert.equal(ledger.trialBalance().reduce((sum, row) => sum + row.balanceCents, 0), 0);
  assert.equal(ledger.trialBalance().find((row) => row.code === 'CASH').balanceCents, 0);
});

test('a compound entry debits an expense and credits cash and a payable', () => {
  const ledger = memoryLedger();
  ledger.addAccount({ code: 'WAGES', name: 'Wage expense', type: 'expense' });
  ledger.addAccount({ code: 'TAX', name: 'Payroll tax payable', type: 'liability' });
  ledger.addAccount({ code: 'CASH', name: 'Checking', type: 'asset' });
  ledger.postEntry({
    entryDate: '2026-10-28',
    description: 'Payroll',
    lines: [
      { accountCode: 'WAGES', amountCents: 500000 },
      { accountCode: 'TAX', amountCents: -120000 },
      { accountCode: 'CASH', amountCents: -380000 },
    ],
  });
  const rows = ledger.trialBalance();
  const debit = rows.reduce((sum, row) => sum + row.debitCents, 0);
  const credit = rows.reduce((sum, row) => sum + row.creditCents, 0);
  assert.equal(debit, credit);
  assert.equal(rows.find((row) => row.code === 'CASH').balanceCents, -380000);
  assert.equal(rows.find((row) => row.code === 'WAGES').balanceCents, 500000);
});

test('a posted entry is not revised in place; a slip appends another event', () => {
  const ledger = memoryLedger();
  ledger.appendEvent({
    aggregateId: 'cabinet-mfg',
    eventType: 'CONTRACT_MILESTONE_COMMITTED',
    occurredAt: '2026-10-28T16:00:00.000Z',
    effectiveDate: '2026-11-20',
    targetAccount: 'CHK_PROJ',
    amountCents: -800000,
    payload: { vendor: 'Cabinet Maker', milestone: 'Factory completion' },
  });
  ledger.appendEvent({
    aggregateId: 'cabinet-mfg',
    eventType: 'COMMITMENT_SCHEDULE_SLIPPED',
    occurredAt: '2026-11-05T16:00:00.000Z',
    effectiveDate: '2026-11-30',
    targetAccount: 'CHK_PROJ',
    amountCents: 0,
    payload: { reason: 'Lumber delay' },
  });
  ledger.appendEvent({
    aggregateId: 'cabinet-mfg',
    eventType: 'INVOICE_RECEIVED_AND_APPROVED',
    occurredAt: '2026-11-28T16:00:00.000Z',
    effectiveDate: '2026-12-05',
    targetAccount: 'CHK_PROJ',
    amountCents: -20000,
    payload: { invoiceNo: 'INV-1042' },
  });
  const events = ledger.listEvents();
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((event) => event.eventSeq), [1, 2, 3]);
  const [obligation] = ledger.obligations();
  assert.equal(obligation.status, 'BILLED');
  assert.equal(obligation.effectiveDate, '2026-12-05');
  assert.equal(obligation.amountCents, -820000);
  assert.equal(obligation.vendor, 'Cabinet Maker');
});

test('Veterans Day 2026 is not a banking day', () => {
  const wednesday = parseCivil('2026-11-11');
  assert.equal(isBankBusinessDay(wednesday), false);
  const tuesday = parseCivil('2026-11-10');
  assert.equal(
    `${advanceBusinessDays(tuesday, 1).year}-${String(advanceBusinessDays(tuesday, 1).month).padStart(2, '0')}-${String(advanceBusinessDays(tuesday, 1).day).padStart(2, '0')}`,
    '2026-11-12',
  );
});

test('the demo books balance and the project runway matches the cabinet schedule', () => {
  const report = buildDemoReport();
  assert.equal(report.debitTotalCents, report.creditTotalCents);
  assert.equal(report.trialBalance.find((row) => row.code === 'CHK_PROJ').balanceCents, 1500000);
  const runway = report.runway.CHK_PROJ;
  assert.equal(runway.deficitDate, null);
  assert.deepEqual(runway.rows.map((row) => [row.date, row.balanceCents]), [
    ['2026-10-28', 1500000],
    ['2026-11-10', 1150000],
    ['2026-11-20', 350000],
    ['2026-12-15', 150000],
  ]);
  const exposure = report.vendorExposure.find((row) => row.vendor === 'Cabinet Maker');
  assert.equal(exposure.totalCents, -1000000);
});

test('an added commitment reveals the funding deficit date', () => {
  const report = buildDemoReport();
  const extra = foldObligations([
    ...demoBooks().events.map((event, index) => ({ ...event, eventSeq: index + 1 })),
    {
      aggregateId: 'extra-dec',
      eventSeq: 1,
      eventType: 'CONTRACT_MILESTONE_COMMITTED',
      effectiveDate: '2026-12-01',
      targetAccount: 'CHK_PROJ',
      amountCents: -1000000,
      payload: { vendor: 'Extra Vendor', milestone: 'Change order' },
    },
  ]);
  const opening = report.trialBalance.find((row) => row.code === 'CHK_PROJ').balanceCents;
  const runway = projectRunway(opening, '2026-10-28', extra
    .filter((row) => row.targetAccount === 'CHK_PROJ')
    .map((row) => ({ date: row.effectiveDate, deltaCents: row.amountCents, label: row.milestone })));
  assert.equal(runway.deficitDate, '2026-12-01');
});

test('the reference route moves the full $8,500 on same-day ACH and does not split it', () => {
  const routes = routeLiquidity(defaultRails(), referenceRouteRequest());
  assert.ok(routes.length >= 2);
  const chosen = routes[0];
  assert.equal(chosen.onTime, true);
  assert.equal(chosen.amountCents, 850000);
  assert.deepEqual(chosen.hops.map((hop) => hop.rail), ['ACH_SAME_DAY', 'INTERNAL_BOOK']);
  assert.equal(chosen.railFeeCents, 1000);
  assert.equal(chosen.arrival, '2026-10-29T15:05');
  assert.equal(routes.every((route) => route.amountCents === 850000), true);
  assert.equal(routes.some((route) => route.hops.some((hop) => hop.rail === 'ACH_P2P')), false);
  const hold = routes.find((route) => route.hops[0].rail === 'ACH_P2P_HOLD' && route.hops.length === 1);
  assert.equal(hold.onTime, false);
  assert.ok(hold.totalCostCents > chosen.totalCostCents);
});

test('an equity sale settles one banking day before the cash can move', () => {
  const routes = routeLiquidity(defaultRails(), {
    source: 'EQUITIES',
    target: 'CHK_PROJ',
    amountCents: 2000000,
    start: '2026-10-27T09:00',
    deadline: '2026-10-29T13:00',
    latePenaltyCents: 20000,
    perDiemCents: 5000,
    annualYieldBps: 450,
    breachLossCents: 100000,
  });
  assert.equal(routes[0].onTime, true);
  assert.deepEqual(routes[0].hops.map((hop) => hop.rail), ['EQUITY_SALE', 'INTERNAL_SWEEP', 'INTERNAL_BOOK']);
  assert.equal(routes[0].hops[0].arrival, '2026-10-28T17:00');
  assert.equal(routes[0].amountCents, 2000000);
});

test('a rail under its published maximum is eligible and one cent over is not', () => {
  const under = routeLiquidity(defaultRails(), {
    ...referenceRouteRequest(),
    amountCents: 500000,
    start: '2026-10-29T09:15',
    deadline: '2026-10-29T12:00',
  });
  assert.equal(under[0].hops.map((hop) => hop.rail).join(','), 'ACH_P2P');
  const over = routeLiquidity(defaultRails(), {
    ...referenceRouteRequest(),
    amountCents: 500001,
    deadline: '2026-11-20T17:00',
  });
  assert.equal(over.some((route) => route.hops.some((hop) => hop.rail === 'ACH_P2P')), false);
  assert.equal(over.some((route) => route.hops[0].rail === 'ACH_P2P_HOLD'), true);
});

test('sqlite demo books match the pure report', () => {
  const ledger = memoryLedger();
  loadBooks(ledger, demoBooks());
  const pure = buildDemoReport();
  assert.deepEqual(ledger.trialBalance(), pure.trialBalance);
  assert.deepEqual(
    ledger.obligations().map((row) => [row.aggregateId, row.amountCents, row.status, row.effectiveDate]),
    pure.obligations.map((row) => [row.aggregateId, row.amountCents, row.status, row.effectiveDate]),
  );
});

test('cleared obligations drop out of the runway', () => {
  const ledger = memoryLedger();
  loadBooks(ledger, demoBooks());
  ledger.appendEvent({
    aggregateId: 'tile-balance',
    eventType: 'PAYMENT_DISPATCHED',
    occurredAt: '2026-11-10T17:00:00.000Z',
    effectiveDate: '2026-11-10',
    targetAccount: 'CHK_PROJ',
    amountCents: 0,
    payload: { paymentMethod: 'ACH' },
  });
  const open = ledger.obligations().filter((row) => row.status !== 'CLEARED' && row.targetAccount === 'CHK_PROJ');
  assert.equal(open.some((row) => row.aggregateId === 'tile-balance'), false);
});

test('the CLI names its commands and the demo JSON balances', () => {
  const missing = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'pareto.js'], { encoding: 'utf8' });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /init, demo, trial-balance, post, obligations, runway, or route/);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pareto-'));
  const dbPath = path.join(directory, 'books.sqlite');
  let output = '';
  const write = process.stdout.write;
  process.stdout.write = (chunk) => {
    output += chunk;
    return true;
  };
  try {
    runCli(['demo', '--db', dbPath, '--json']);
  } finally {
    process.stdout.write = write;
  }
  const report = JSON.parse(output);
  assert.equal(report.balanced, true);
  assert.equal(report.route.routes[0].hops[0].rail, 'ACH_SAME_DAY');
  runCli(['post', '--db', dbPath, '--date', '2026-11-01', '--description', 'Permit accrual', '--line', 'CIP:debit:1200', '--line', 'AP:credit:1200']);
  const ledger = require('./ledger.js').openLedger(new DatabaseSync(dbPath));
  assert.equal(ledger.balanceOf('AP'), -120000);
});
