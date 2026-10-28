export function dollarsToCents(dollars: string | number): number;
export function formatGroupedCents(cents: number): string;

export type TrialRow = {
  code: string;
  name: string;
  type: string;
  balanceCents: number;
  debitCents: number;
  creditCents: number;
};

export type Obligation = {
  aggregateId: string;
  status: string;
  effectiveDate: string;
  targetAccount: string;
  amountCents: number;
  vendor: string | null;
  milestone: string | null;
  contractRef: string | null;
};

export type Exposure = {
  vendor: string;
  committedCents: number;
  billedCents: number;
  totalCents: number;
};

export type RunwayRow = {
  date: string;
  label: string;
  deltaCents: number;
  balanceCents: number;
};

export type Runway = {
  rows: RunwayRow[];
  deficitDate: string | null;
};

export type Rail = {
  src: string;
  dst: string;
  rail: string;
  flatFeeCents: number;
  cutoffMinutes: number;
  settlementType: string;
  latencyMinutes: number;
  holdBusinessDays: number;
  minCents: number;
  maxCents: number | null;
  delayHazardMicros: number;
};

export type RouteRequest = {
  source: string;
  target: string;
  amountCents: number;
  start: string;
  deadline: string;
  latePenaltyCents?: number;
  perDiemCents?: number;
  annualYieldBps?: number;
  breachLossCents?: number;
};

export type RouteHop = {
  rail: string;
  src: string;
  dst: string;
  arrival: string;
  feeCents: number;
};

export type Route = {
  amountCents: number;
  onTime: boolean;
  arrival: string;
  railFeeCents: number;
  lostInterestCents: number;
  delayPenaltyCents: number;
  riskPremiumCents: number;
  totalCostCents: number;
  hops: RouteHop[];
};

export type DemoReport = {
  asOf: string;
  trialBalance: TrialRow[];
  debitTotalCents: number;
  creditTotalCents: number;
  obligations: Obligation[];
  vendorExposure: Exposure[];
  runway: Record<string, Runway>;
  referenceRoute: {
    request: RouteRequest;
    routes: Route[];
  };
};

export function buildDemoReport(): DemoReport;
export function routeLiquidity(edges: Rail[], request: RouteRequest): Route[];
export function defaultRails(): Rail[];
export function referenceRouteRequest(): RouteRequest;
