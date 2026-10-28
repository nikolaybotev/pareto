'use strict';

// Double-entry ledger, append-only cash obligations, and a full-amount
// liquidity router. Money is integer cents. Reported dollars are formatted
// from those cents. This file has no Node APIs; the CLI opens SQLite.

const ACCOUNT_TYPES = new Set(['asset', 'liability', 'equity', 'revenue', 'expense']);

const EVENT_TYPES = new Set([
  'CONTRACT_MILESTONE_COMMITTED',
  'COMMITMENT_SCHEDULE_SLIPPED',
  'INVOICE_RECEIVED_AND_APPROVED',
  'PAYMENT_DISPATCHED',
]);

const FEDERAL_RESERVE_HOLIDAYS_2026 = Object.freeze([
  '2026-01-01',
  '2026-01-19',
  '2026-02-16',
  '2026-05-25',
  '2026-06-19',
  '2026-07-03',
  '2026-09-07',
  '2026-10-12',
  '2026-11-11',
  '2026-11-26',
  '2026-12-25',
]);

const HOLIDAYS_2026 = new Set(FEDERAL_RESERVE_HOLIDAYS_2026);

const SCHEMA = `
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense'))
);

CREATE TABLE entries (
  id INTEGER PRIMARY KEY,
  entry_date TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE entry_lines (
  id INTEGER PRIMARY KEY,
  entry_id INTEGER NOT NULL REFERENCES entries(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents != 0),
  memo TEXT,
  counterparty TEXT
);

CREATE TABLE treasury_events (
  event_id INTEGER PRIMARY KEY,
  aggregate_id TEXT NOT NULL,
  event_seq INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  target_account TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  UNIQUE (aggregate_id, event_seq)
);

CREATE VIEW account_balances AS
SELECT
  a.id,
  a.code,
  a.name,
  a.type,
  COALESCE(SUM(l.amount_cents), 0) AS balance_cents
FROM accounts a
LEFT JOIN entry_lines l ON l.account_id = a.id
GROUP BY a.id;
`;

function dollarsToCents(dollars) {
  if (typeof dollars === 'string') {
    if (!/^-?(?:\d+)(?:\.\d{1,2})?$/.test(dollars)) {
      throw new Error('amount is not a dollar amount with at most two decimal places');
    }
    const negative = dollars.startsWith('-');
    const [whole, fraction = ''] = dollars.replace('-', '').split('.');
    const cents = (Number(whole) * 100) + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(cents)) throw new Error('amount is too large to store in cents');
    return negative ? -cents : cents;
  }
  if (!Number.isFinite(dollars)) throw new Error('amount is not a finite number of dollars');
  const negative = dollars < 0;
  const shifted = Number(`${Math.abs(dollars)}e2`);
  if (!Number.isFinite(shifted)) throw new Error('amount could not be rounded to cents');
  const cents = Math.round(shifted);
  if (!Number.isSafeInteger(cents)) throw new Error('amount is too large to store in cents');
  return negative ? -cents : cents;
}

function formatGroupedCents(cents) {
  if (!Number.isSafeInteger(cents)) throw new Error('amount is not integer cents');
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}.${frac}`;
}

function formatPlainCents(cents) {
  if (!Number.isSafeInteger(cents)) throw new Error('amount is not integer cents');
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

function halfUpDiv(numerator, denominator) {
  if (typeof numerator !== 'bigint' || typeof denominator !== 'bigint' || denominator <= 0n) {
    throw new Error('amount could not be rounded');
  }
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const quotient = magnitude / denominator;
  const remainder = magnitude % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  const signed = negative ? -rounded : rounded;
  const asNumber = Number(signed);
  if (!Number.isSafeInteger(asNumber)) throw new Error('amount is too large to store in cents');
  return asNumber;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function parseCivil(text) {
  if (typeof text !== 'string') throw new Error('invalid timestamp');
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(text);
  if (!match) throw new Error(`invalid timestamp: ${text}`);
  const civil = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: match[4] === undefined ? 0 : Number(match[4]),
    minute: match[5] === undefined ? 0 : Number(match[5]),
  };
  if (civil.month < 1 || civil.month > 12 || civil.day < 1 || civil.day > 31) {
    throw new Error(`invalid timestamp: ${text}`);
  }
  if (civil.hour > 23 || civil.minute > 59) throw new Error(`invalid timestamp: ${text}`);
  const check = new Date(Date.UTC(civil.year, civil.month - 1, civil.day));
  if (check.getUTCFullYear() !== civil.year || check.getUTCMonth() !== civil.month - 1 || check.getUTCDate() !== civil.day) {
    throw new Error(`invalid timestamp: ${text}`);
  }
  return civil;
}

function dateKey(civil) {
  return `${civil.year}-${pad2(civil.month)}-${pad2(civil.day)}`;
}

function formatCivil(civil) {
  return `${dateKey(civil)}T${pad2(civil.hour)}:${pad2(civil.minute)}`;
}

function civilToMs(civil) {
  return Date.UTC(civil.year, civil.month - 1, civil.day, civil.hour, civil.minute, 0, 0);
}

function msToCivil(ms) {
  const date = new Date(ms);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  };
}

function addDays(civil, days) {
  const date = new Date(Date.UTC(civil.year, civil.month - 1, civil.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: civil.hour,
    minute: civil.minute,
  };
}

function weekday(civil) {
  return new Date(Date.UTC(civil.year, civil.month - 1, civil.day)).getUTCDay();
}

function isBankBusinessDay(civil) {
  const day = weekday(civil);
  if (day === 0 || day === 6) return false;
  return !HOLIDAYS_2026.has(dateKey(civil));
}

function nextBankBusinessDay(civil) {
  let cursor = addDays({ ...civil, hour: 0, minute: 0 }, 1);
  while (!isBankBusinessDay(cursor)) cursor = addDays(cursor, 1);
  return { ...cursor, hour: civil.hour, minute: civil.minute };
}

function advanceBusinessDays(civil, count) {
  let cursor = { ...civil };
  for (let i = 0; i < count; i += 1) cursor = nextBankBusinessDay(cursor);
  return cursor;
}

function atMinutes(civil, minutes) {
  return {
    year: civil.year,
    month: civil.month,
    day: civil.day,
    hour: Math.trunc(minutes / 60),
    minute: minutes % 60,
  };
}

function minutesOf(civil) {
  return (civil.hour * 60) + civil.minute;
}

function snapToBankOpen(civil) {
  if (isBankBusinessDay(civil)) return civil;
  const previous = addDays(civil, -1);
  const opened = nextBankBusinessDay(previous);
  return atMinutes(opened, 8 * 60);
}

function transit(edge, fromMs) {
  let civil = snapToBankOpen(msToCivil(fromMs));
  const minutes = minutesOf(civil);
  if (edge.settlementType === 'INSTANT') {
    const arrivalMs = civilToMs(civil) + (edge.latencyMinutes * 60 * 1000);
    return arrivalMs;
  }
  if (edge.settlementType === 'T0_HOURS') {
    const arrival = minutes <= edge.cutoffMinutes
      ? msToCivil(civilToMs(civil) + (edge.latencyMinutes * 60 * 1000))
      : msToCivil(civilToMs(atMinutes(nextBankBusinessDay(civil), 8 * 60)) + (edge.latencyMinutes * 60 * 1000));
    return civilToMs(arrival);
  }
  if (edge.settlementType === 'SAME_DAY') {
    const arrival = minutes <= edge.cutoffMinutes
      ? atMinutes(civil, 15 * 60)
      : atMinutes(nextBankBusinessDay(civil), 15 * 60);
    return civilToMs(arrival);
  }
  if (edge.settlementType === 'T1_CLOSE') {
    const effective = minutes <= edge.cutoffMinutes ? civil : nextBankBusinessDay(civil);
    return civilToMs(atMinutes(advanceBusinessDays(effective, 1), 17 * 60));
  }
  if (edge.settlementType === 'HOLD') {
    const effective = minutes <= edge.cutoffMinutes ? civil : nextBankBusinessDay(civil);
    return civilToMs(atMinutes(advanceBusinessDays(effective, edge.holdBusinessDays), 17 * 60));
  }
  throw new Error(`unknown settlement type: ${edge.settlementType}`);
}

function eligible(edge, amountCents) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return false;
  if (amountCents < edge.minCents) return false;
  if (edge.maxCents != null && amountCents > edge.maxCents) return false;
  return true;
}

function combineHazard(left, right) {
  const remain = Number((BigInt(1000000 - left) * BigInt(1000000 - right)) / 1000000n);
  return 1000000 - remain;
}

function lostInterestCents(principalCents, yieldBps, transitMs) {
  if (transitMs <= 0 || principalCents <= 0 || yieldBps <= 0) return 0;
  const numerator = BigInt(principalCents) * BigInt(yieldBps) * BigInt(transitMs);
  const denominator = 10000n * 365n * 86400000n;
  return halfUpDiv(numerator, denominator);
}

function delayPenaltyCents(arrivalMs, deadlineMs, latePenaltyCents, perDiemCents) {
  if (arrivalMs <= deadlineMs) return 0;
  const overdueMs = BigInt(arrivalMs - deadlineMs);
  const dayMs = 86400000n;
  const perDiem = overdueMs <= dayMs
    ? perDiemCents
    : halfUpDiv(BigInt(perDiemCents) * overdueMs, dayMs);
  return latePenaltyCents + perDiem;
}

function riskPremiumCents(hazardMicros, breachLossCents) {
  if (hazardMicros <= 0 || breachLossCents <= 0) return 0;
  return halfUpDiv(BigInt(hazardMicros) * BigInt(breachLossCents), 1000000n);
}

function routeLiquidity(edges, request) {
  if (!Array.isArray(edges)) throw new Error('rails are required');
  const amountCents = request.amountCents;
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error('amount must be a positive number of cents');
  }
  const startMs = civilToMs(parseCivil(request.start));
  const deadlineMs = civilToMs(parseCivil(request.deadline));
  const latePenaltyCents = request.latePenaltyCents ?? 0;
  const perDiemCents = request.perDiemCents ?? 0;
  const annualYieldBps = request.annualYieldBps ?? 0;
  const breachLossCents = request.breachLossCents ?? 0;
  const routes = [];

  function walk(node, atMs, feeCents, hazardMicros, hops) {
    if (node === request.target) {
      const lost = lostInterestCents(amountCents, annualYieldBps, atMs - startMs);
      const penalty = delayPenaltyCents(atMs, deadlineMs, latePenaltyCents, perDiemCents);
      const risk = riskPremiumCents(hazardMicros, breachLossCents);
      routes.push({
        amountCents,
        onTime: atMs <= deadlineMs,
        arrival: formatCivil(msToCivil(atMs)),
        arrivalMs: atMs,
        railFeeCents: feeCents,
        lostInterestCents: lost,
        delayPenaltyCents: penalty,
        riskPremiumCents: risk,
        totalCostCents: feeCents + lost + penalty + risk,
        hops,
      });
      return;
    }
    if (hops.length >= 4) return;
    const seen = new Set([request.source, ...hops.map((hop) => hop.dst)]);
    for (const edge of edges) {
      if (edge.src !== node) continue;
      if (seen.has(edge.dst)) continue;
      if (!eligible(edge, amountCents)) continue;
      const arrivalMs = transit(edge, atMs);
      walk(edge.dst, arrivalMs, feeCents + edge.flatFeeCents, combineHazard(hazardMicros, edge.delayHazardMicros), hops.concat([{
        rail: edge.rail,
        src: edge.src,
        dst: edge.dst,
        arrival: formatCivil(msToCivil(arrivalMs)),
        feeCents: edge.flatFeeCents,
      }]));
    }
  }

  if (request.source === request.target) throw new Error('source and target must differ');
  walk(request.source, startMs, 0, 0, []);
  routes.sort((left, right) => left.totalCostCents - right.totalCostCents || left.arrivalMs - right.arrivalMs);
  return routes.map((route) => {
    const copy = { ...route };
    delete copy.arrivalMs;
    return copy;
  });
}

function defaultRails() {
  return [
    {
      src: 'SAVINGS', dst: 'CHK_PROJ', rail: 'ACH_P2P', flatFeeCents: 0,
      cutoffMinutes: 14 * 60, settlementType: 'INSTANT', latencyMinutes: 5,
      holdBusinessDays: 0, minCents: 1, maxCents: 500000, delayHazardMicros: 10000,
    },
    {
      src: 'SAVINGS', dst: 'CHK_PROJ', rail: 'ACH_P2P_HOLD', flatFeeCents: 0,
      cutoffMinutes: 14 * 60, settlementType: 'HOLD', latencyMinutes: 0,
      holdBusinessDays: 5, minCents: 500001, maxCents: null, delayHazardMicros: 50000,
    },
    {
      src: 'SAVINGS', dst: 'CHK_OPS', rail: 'ACH_STANDARD', flatFeeCents: 0,
      cutoffMinutes: 13 * 60, settlementType: 'T1_CLOSE', latencyMinutes: 0,
      holdBusinessDays: 0, minCents: 1, maxCents: null, delayHazardMicros: 20000,
    },
    {
      src: 'SAVINGS', dst: 'CHK_OPS', rail: 'ACH_SAME_DAY', flatFeeCents: 1000,
      cutoffMinutes: 10 * 60 + 30, settlementType: 'SAME_DAY', latencyMinutes: 0,
      holdBusinessDays: 0, minCents: 1, maxCents: null, delayHazardMicros: 10000,
    },
    {
      src: 'CHK_OPS', dst: 'CHK_PROJ', rail: 'INTERNAL_BOOK', flatFeeCents: 0,
      cutoffMinutes: 23 * 60 + 59, settlementType: 'INSTANT', latencyMinutes: 5,
      holdBusinessDays: 0, minCents: 1, maxCents: null, delayHazardMicros: 1000,
    },
    {
      src: 'CHK_OPS', dst: 'CHK_PROJ', rail: 'FEDWIRE', flatFeeCents: 3000,
      cutoffMinutes: 14 * 60, settlementType: 'T0_HOURS', latencyMinutes: 60,
      holdBusinessDays: 0, minCents: 1, maxCents: null, delayHazardMicros: 1000,
    },
    {
      src: 'EQUITIES', dst: 'BROKER_CASH', rail: 'EQUITY_SALE', flatFeeCents: 0,
      cutoffMinutes: 13 * 60, settlementType: 'T1_CLOSE', latencyMinutes: 0,
      holdBusinessDays: 0, minCents: 1, maxCents: null, delayHazardMicros: 10000,
    },
    {
      src: 'BROKER_CASH', dst: 'CHK_OPS', rail: 'INTERNAL_SWEEP', flatFeeCents: 0,
      cutoffMinutes: 23 * 60 + 59, settlementType: 'INSTANT', latencyMinutes: 5,
      holdBusinessDays: 0, minCents: 1, maxCents: null, delayHazardMicros: 1000,
    },
  ];
}

function referenceRouteRequest() {
  return {
    source: 'SAVINGS',
    target: 'CHK_PROJ',
    amountCents: 850000,
    start: '2026-10-29T09:15',
    deadline: '2026-10-30T15:00',
    latePenaltyCents: 20000,
    perDiemCents: 5000,
    annualYieldBps: 450,
    breachLossCents: 100000,
  };
}

function signedBalancePresentation(balanceCents) {
  if (balanceCents > 0) return { debitCents: balanceCents, creditCents: 0 };
  if (balanceCents < 0) return { debitCents: 0, creditCents: -balanceCents };
  return { debitCents: 0, creditCents: 0 };
}

function presentBalanceRow(row) {
  const sides = signedBalancePresentation(row.balanceCents);
  return {
    code: row.code,
    name: row.name,
    type: row.type,
    balanceCents: row.balanceCents,
    debitCents: sides.debitCents,
    creditCents: sides.creditCents,
  };
}

function foldObligations(events) {
  const groups = new Map();
  const ordered = [...events].sort((left, right) => {
    if (left.aggregateId !== right.aggregateId) return left.aggregateId < right.aggregateId ? -1 : 1;
    return left.eventSeq - right.eventSeq;
  });
  for (const event of ordered) {
    if (!EVENT_TYPES.has(event.eventType)) throw new Error(`unknown event type: ${event.eventType}`);
    let state = groups.get(event.aggregateId);
    if (!state) {
      if (event.eventType !== 'CONTRACT_MILESTONE_COMMITTED') {
        throw new Error(`obligation ${event.aggregateId} must start with a commitment`);
      }
      state = {
        aggregateId: event.aggregateId,
        status: 'COMMITTED',
        effectiveDate: event.effectiveDate,
        targetAccount: event.targetAccount,
        amountCents: 0,
        vendor: null,
        milestone: null,
        contractRef: null,
        eventCount: 0,
      };
      groups.set(event.aggregateId, state);
    }
    state.amountCents += event.amountCents;
    state.effectiveDate = event.effectiveDate;
    state.targetAccount = event.targetAccount;
    state.eventCount += 1;
    const payload = event.payload || {};
    if (payload.vendor) state.vendor = payload.vendor;
    if (payload.milestone) state.milestone = payload.milestone;
    if (payload.contractRef) state.contractRef = payload.contractRef;
    if (event.eventType === 'INVOICE_RECEIVED_AND_APPROVED') state.status = 'BILLED';
    if (event.eventType === 'PAYMENT_DISPATCHED') state.status = 'CLEARED';
  }
  return [...groups.values()].sort((left, right) => left.aggregateId < right.aggregateId ? -1 : 1);
}

function vendorExposure(obligations) {
  const byVendor = new Map();
  for (const obligation of obligations) {
    if (obligation.status === 'CLEARED') continue;
    const key = obligation.vendor || 'Unassigned';
    let row = byVendor.get(key);
    if (!row) {
      row = { vendor: key, committedCents: 0, billedCents: 0, totalCents: 0 };
      byVendor.set(key, row);
    }
    if (obligation.status === 'BILLED') row.billedCents += obligation.amountCents;
    else row.committedCents += obligation.amountCents;
    row.totalCents += obligation.amountCents;
  }
  return [...byVendor.values()].sort((left, right) => left.vendor < right.vendor ? -1 : 1);
}

function projectRunway(openingCents, openingDate, flows) {
  const rows = [{
    date: openingDate,
    label: 'Opening balance',
    deltaCents: openingCents,
    balanceCents: openingCents,
  }];
  let balance = openingCents;
  const sorted = [...flows].sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : 0));
  for (const flow of sorted) {
    balance += flow.deltaCents;
    rows.push({
      date: flow.date,
      label: flow.label,
      deltaCents: flow.deltaCents,
      balanceCents: balance,
    });
  }
  const deficit = rows.slice(1).find((row) => row.balanceCents < 0);
  return { rows, deficitDate: deficit ? deficit.date : null };
}

function demoBooks() {
  return {
    accounts: [
      { code: 'CHK_OPS', name: 'Operating Checking', type: 'asset' },
      { code: 'CHK_PROJ', name: 'Project Checking', type: 'asset' },
      { code: 'SAVINGS', name: 'High-Yield Savings', type: 'asset' },
      { code: 'CIP', name: 'Construction in Progress', type: 'asset' },
      { code: 'AP', name: 'Accounts Payable', type: 'liability' },
      { code: 'EQUITY', name: 'Owner Equity', type: 'equity' },
    ],
    entries: [
      {
        entryDate: '2026-10-27',
        description: 'Opening cash balances',
        createdAt: '2026-10-27T15:00:00.000Z',
        lines: [
          { accountCode: 'CHK_OPS', amountCents: 1500000, memo: 'Operating checking' },
          { accountCode: 'CHK_PROJ', amountCents: 2500000, memo: 'Project checking' },
          { accountCode: 'SAVINGS', amountCents: 4500000, memo: 'High-yield savings' },
          { accountCode: 'EQUITY', amountCents: -8500000, memo: 'Owner funding' },
        ],
      },
      {
        entryDate: '2026-10-28',
        description: 'Cabinet deposit paid',
        createdAt: '2026-10-28T16:00:00.000Z',
        lines: [
          { accountCode: 'CIP', amountCents: 1000000, memo: 'Signing deposit', counterparty: 'Cabinet Maker' },
          { accountCode: 'CHK_PROJ', amountCents: -1000000, memo: 'Signing deposit', counterparty: 'Cabinet Maker' },
        ],
      },
    ],
    events: [
      {
        aggregateId: 'cabinet-mfg',
        eventType: 'CONTRACT_MILESTONE_COMMITTED',
        occurredAt: '2026-10-28T16:30:00.000Z',
        effectiveDate: '2026-11-20',
        targetAccount: 'CHK_PROJ',
        amountCents: -800000,
        payload: { vendor: 'Cabinet Maker', contractRef: 'CTR-2026-088', milestone: 'Factory completion (40%)' },
      },
      {
        aggregateId: 'cabinet-delivery',
        eventType: 'CONTRACT_MILESTONE_COMMITTED',
        occurredAt: '2026-10-28T16:30:00.000Z',
        effectiveDate: '2026-12-15',
        targetAccount: 'CHK_PROJ',
        amountCents: -200000,
        payload: { vendor: 'Cabinet Maker', contractRef: 'CTR-2026-088', milestone: 'Delivery and install (10%)' },
      },
      {
        aggregateId: 'tile-balance',
        eventType: 'CONTRACT_MILESTONE_COMMITTED',
        occurredAt: '2026-10-28T16:30:00.000Z',
        effectiveDate: '2026-11-10',
        targetAccount: 'CHK_PROJ',
        amountCents: -350000,
        payload: { vendor: 'Tile Store', contractRef: 'PO-441', milestone: 'Order balance' },
      },
      {
        aggregateId: 'permit-phase-2',
        eventType: 'CONTRACT_MILESTONE_COMMITTED',
        occurredAt: '2026-10-28T16:30:00.000Z',
        effectiveDate: '2026-11-05',
        targetAccount: 'CHK_OPS',
        amountCents: -120000,
        payload: { vendor: 'City Building Dept', contractRef: 'PERMIT-2', milestone: 'Plan check phase 2' },
      },
    ],
  };
}

function balancesFromEntries(accounts, entries) {
  const byCode = new Map(accounts.map((account) => [account.code, { ...account, balanceCents: 0 }]));
  for (const entry of entries) {
    let sum = 0;
    for (const line of entry.lines) {
      const account = byCode.get(line.accountCode);
      if (!account) throw new Error(`unknown account: ${line.accountCode}`);
      account.balanceCents += line.amountCents;
      sum += line.amountCents;
    }
    if (sum !== 0) throw new Error('entry does not balance');
  }
  return [...byCode.values()].map(presentBalanceRow).sort((left, right) => (left.code < right.code ? -1 : 1));
}

function runwayFor(trialBalance, obligations, accountCode, openingDate) {
  const account = trialBalance.find((row) => row.code === accountCode);
  const opening = account ? account.balanceCents : 0;
  const flows = obligations
    .filter((obligation) => obligation.status !== 'CLEARED' && obligation.targetAccount === accountCode)
    .map((obligation) => ({
      date: obligation.effectiveDate,
      deltaCents: obligation.amountCents,
      label: `${obligation.vendor || 'Obligation'}: ${obligation.milestone || obligation.aggregateId}`,
    }));
  return projectRunway(opening, openingDate, flows);
}

function buildDemoReport() {
  const books = demoBooks();
  const trialBalance = balancesFromEntries(books.accounts, books.entries);
  const obligations = foldObligations(books.events.map((event, index) => ({ ...event, eventSeq: index + 1 })));
  const routes = routeLiquidity(defaultRails(), referenceRouteRequest());
  const debitTotalCents = trialBalance.reduce((sum, row) => sum + row.debitCents, 0);
  const creditTotalCents = trialBalance.reduce((sum, row) => sum + row.creditCents, 0);
  return {
    asOf: '2026-10-28',
    trialBalance,
    debitTotalCents,
    creditTotalCents,
    obligations,
    vendorExposure: vendorExposure(obligations),
    runway: {
      CHK_PROJ: runwayFor(trialBalance, obligations, 'CHK_PROJ', '2026-10-28'),
      CHK_OPS: runwayFor(trialBalance, obligations, 'CHK_OPS', '2026-10-28'),
    },
    referenceRoute: {
      request: referenceRouteRequest(),
      routes,
    },
  };
}

function assertAccount(account) {
  if (!account || typeof account.code !== 'string' || !/^[A-Z][A-Z0-9_]{0,31}$/.test(account.code)) {
    throw new Error('account code must be uppercase letters, digits, or underscores');
  }
  if (typeof account.name !== 'string' || account.name.trim() === '') throw new Error('account name is required');
  if (!ACCOUNT_TYPES.has(account.type)) throw new Error(`unknown account type: ${account.type}`);
}

function assertEntry(entry) {
  if (!entry || !/^\d{4}-\d{2}-\d{2}$/.test(entry.entryDate || '')) throw new Error('entry date is required');
  parseCivil(entry.entryDate);
  if (typeof entry.description !== 'string' || entry.description.trim() === '') {
    throw new Error('entry description is required');
  }
  if (!Array.isArray(entry.lines) || entry.lines.length < 2) throw new Error('entry needs at least two lines');
  let sum = 0;
  for (const line of entry.lines) {
    if (!Number.isSafeInteger(line.amountCents) || line.amountCents === 0) {
      throw new Error('each line needs a non-zero integer cent amount');
    }
    sum += line.amountCents;
  }
  if (sum !== 0) throw new Error('entry does not balance');
}

function ledgerApi(db) {
  function addAccount(account) {
    assertAccount(account);
    db.prepare('INSERT INTO accounts (code, name, type) VALUES (?, ?, ?)').run(account.code, account.name, account.type);
  }

  function postEntry(entry) {
    assertEntry(entry);
    db.exec('BEGIN');
    try {
      const createdAt = entry.createdAt || new Date().toISOString();
      const inserted = db.prepare(
        'INSERT INTO entries (entry_date, description, created_at) VALUES (?, ?, ?)',
      ).run(entry.entryDate, entry.description, createdAt);
      const entryId = Number(inserted.lastInsertRowid);
      const insertLine = db.prepare(
        'INSERT INTO entry_lines (entry_id, account_id, amount_cents, memo, counterparty) VALUES (?, ?, ?, ?, ?)',
      );
      for (const line of entry.lines) {
        const account = db.prepare('SELECT id FROM accounts WHERE code = ?').get(line.accountCode);
        if (!account) throw new Error(`unknown account: ${line.accountCode}`);
        insertLine.run(entryId, account.id, line.amountCents, line.memo ?? null, line.counterparty ?? null);
      }
      db.exec('COMMIT');
      return entryId;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function trialBalance() {
    const rows = db.prepare(
      'SELECT code, name, type, balance_cents AS balanceCents FROM account_balances ORDER BY code',
    ).all();
    return rows.map((row) => presentBalanceRow({
      code: row.code,
      name: row.name,
      type: row.type,
      balanceCents: Number(row.balanceCents),
    }));
  }

  function appendEvent(event) {
    if (!EVENT_TYPES.has(event.eventType)) throw new Error(`unknown event type: ${event.eventType}`);
    parseCivil(event.effectiveDate);
    if (!/^[A-Z][A-Z0-9_]{0,31}$/.test(event.targetAccount || '')) {
      throw new Error('target account code is required');
    }
    if (!Number.isSafeInteger(event.amountCents)) throw new Error('event amount must be integer cents');
    const payload = JSON.stringify(event.payload || {});
    db.exec('BEGIN');
    try {
      const prior = db.prepare(
        'SELECT COALESCE(MAX(event_seq), 0) AS seq FROM treasury_events WHERE aggregate_id = ?',
      ).get(event.aggregateId);
      const eventSeq = Number(prior.seq) + 1;
      if (eventSeq === 1 && event.eventType !== 'CONTRACT_MILESTONE_COMMITTED') {
        throw new Error(`obligation ${event.aggregateId} must start with a commitment`);
      }
      db.prepare(`
        INSERT INTO treasury_events (
          aggregate_id, event_seq, event_type, occurred_at, effective_date, target_account, amount_cents, payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        event.aggregateId,
        eventSeq,
        event.eventType,
        event.occurredAt,
        event.effectiveDate,
        event.targetAccount,
        event.amountCents,
        payload,
      );
      db.exec('COMMIT');
      return eventSeq;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function listEvents() {
    return db.prepare(`
      SELECT aggregate_id AS aggregateId, event_seq AS eventSeq, event_type AS eventType,
             occurred_at AS occurredAt, effective_date AS effectiveDate,
             target_account AS targetAccount, amount_cents AS amountCents, payload
      FROM treasury_events
      ORDER BY aggregate_id, event_seq
    `).all().map((row) => ({
      aggregateId: row.aggregateId,
      eventSeq: Number(row.eventSeq),
      eventType: row.eventType,
      occurredAt: row.occurredAt,
      effectiveDate: row.effectiveDate,
      targetAccount: row.targetAccount,
      amountCents: Number(row.amountCents),
      payload: JSON.parse(row.payload),
    }));
  }

  function obligations() {
    return foldObligations(listEvents());
  }

  function balanceOf(code) {
    const row = trialBalance().find((account) => account.code === code);
    return row ? row.balanceCents : null;
  }

  function asOf() {
    const row = db.prepare('SELECT MAX(entry_date) AS asOf FROM entries').get();
    return row && row.asOf ? row.asOf : null;
  }

  return { addAccount, postEntry, trialBalance, appendEvent, listEvents, obligations, balanceOf, asOf };
}

function createLedger(db) {
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  return ledgerApi(db);
}

function openLedger(db) {
  db.exec('PRAGMA foreign_keys = ON');
  return ledgerApi(db);
}

function loadBooks(ledger, books) {
  for (const account of books.accounts) ledger.addAccount(account);
  for (const entry of books.entries) ledger.postEntry(entry);
  for (const event of books.events) ledger.appendEvent(event);
}

module.exports = {
  ACCOUNT_TYPES,
  EVENT_TYPES,
  FEDERAL_RESERVE_HOLIDAYS_2026,
  SCHEMA,
  dollarsToCents,
  formatGroupedCents,
  formatPlainCents,
  parseCivil,
  formatCivil,
  isBankBusinessDay,
  nextBankBusinessDay,
  advanceBusinessDays,
  transit,
  routeLiquidity,
  defaultRails,
  referenceRouteRequest,
  foldObligations,
  vendorExposure,
  projectRunway,
  demoBooks,
  buildDemoReport,
  createLedger,
  openLedger,
  loadBooks,
};
