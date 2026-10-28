import { useMemo, useState } from "preact/hooks";
import {
  buildDemoReport,
  defaultRails,
  dollarsToCents,
  formatGroupedCents,
  referenceRouteRequest,
  routeLiquidity,
  type Route,
} from "../../../ledger.js";

const report = buildDemoReport();
const rails = defaultRails();
const nodes = ["SAVINGS", "CHK_OPS", "CHK_PROJ", "EQUITIES", "BROKER_CASH"];

function money(cents: number) {
  return formatGroupedCents(cents);
}

function RouteList({ routes }: { routes: Route[] }) {
  if (routes.length === 0) {
    return <p class="empty">No route moves the full amount.</p>;
  }
  return (
    <ol class="routes">
      {routes.slice(0, 4).map((route) => (
        <li key={`${route.arrival}-${route.hops.map((hop) => hop.rail).join("-")}`}>
          <div class="route-head">
            <strong>{route.onTime ? "On time" : "Late"}</strong>
            <span>{money(route.totalCostCents)}</span>
          </div>
          <p class="path">{route.hops.map((hop) => `${hop.rail} ${hop.src} → ${hop.dst}`).join(" · ")}</p>
          <p class="meta">
            Arrives {route.arrival}
            {" · "}
            fee {money(route.railFeeCents)}
            {" · "}
            float {money(route.lostInterestCents)}
            {" · "}
            late {money(route.delayPenaltyCents)}
            {" · "}
            delay risk {money(route.riskPremiumCents)}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function App() {
  const reference = referenceRouteRequest();
  const [source, setSource] = useState(reference.source);
  const [target, setTarget] = useState(reference.target);
  const [amount, setAmount] = useState("8500.00");
  const [start, setStart] = useState(reference.start ?? "");
  const [deadline, setDeadline] = useState(reference.deadline ?? "");

  const routed = useMemo(() => {
    try {
      const amountCents = dollarsToCents(amount);
      if (amountCents <= 0) return { error: "Amount must be greater than zero.", routes: [] as Route[] };
      if (source === target) return { error: "Source and target must differ.", routes: [] as Route[] };
      const routes = routeLiquidity(rails, {
        source,
        target,
        amountCents,
        start,
        deadline,
        latePenaltyCents: reference.latePenaltyCents,
        perDiemCents: reference.perDiemCents,
        annualYieldBps: reference.annualYieldBps,
        breachLossCents: reference.breachLossCents,
      });
      return { error: "", routes };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not route.", routes: [] as Route[] };
    }
  }, [amount, deadline, reference.annualYieldBps, reference.breachLossCents, reference.latePenaltyCents, reference.perDiemCents, source, start, target]);

  const project = report.runway.CHK_PROJ;
  const peak = Math.max(...project.rows.map((row) => Math.abs(row.balanceCents)), 1);

  return (
    <main>
      <header>
        <p class="kicker">Pareto</p>
        <h1>What cash is already spoken for, and which rail still arrives whole.</h1>
        <p class="lede">
          The books are a double-entry ledger. Obligations stay on an append-only schedule until they clear.
          A route moves the full amount on one path. A rail whose published maximum is below that amount is left out.
        </p>
      </header>

      <section aria-labelledby="books-heading">
        <h2 id="books-heading">Trial balance</h2>
        <p class="as-of">As of {report.asOf}. Debits and credits use the ledger sign: a debit is positive.</p>
        <table>
          <caption>Demo chart of accounts</caption>
          <thead>
            <tr>
              <th>Account</th>
              <th>Debit</th>
              <th>Credit</th>
            </tr>
          </thead>
          <tbody>
            {report.trialBalance.map((row) => (
              <tr key={row.code}>
                <td>{row.code} · {row.name}</td>
                <td class="num">{row.debitCents || row.creditCents === 0 ? money(row.debitCents) : ""}</td>
                <td class="num">{row.creditCents ? money(row.creditCents) : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>Total</th>
              <td class="num">{money(report.debitTotalCents)}</td>
              <td class="num">{money(report.creditTotalCents)}</td>
            </tr>
          </tfoot>
        </table>
        <p class="balance">{report.debitTotalCents === report.creditTotalCents ? "Books balance." : "Books do not balance."}</p>
      </section>

      <section aria-labelledby="obligations-heading">
        <h2 id="obligations-heading">Open obligations</h2>
        <table>
          <caption>Committed and billed cash that has not cleared</caption>
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Milestone</th>
              <th>Due</th>
              <th>Account</th>
              <th>Remaining</th>
            </tr>
          </thead>
          <tbody>
            {report.obligations.filter((row) => row.status !== "CLEARED").map((row) => (
              <tr key={row.aggregateId}>
                <td>{row.vendor}</td>
                <td>{row.milestone}</td>
                <td>{row.effectiveDate}</td>
                <td>{row.targetAccount}</td>
                <td class="num">{money(row.amountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="runway-heading">
        <h2 id="runway-heading">Project checking runway</h2>
        <p>{project.deficitDate ? `Deficit date: ${project.deficitDate}` : "No deficit on this runway."}</p>
        <ol class="runway">
          {project.rows.map((row) => (
            <li key={`${row.date}-${row.label}`}>
              <div class="runway-label">
                <span>{row.date}</span>
                <span>{row.label}</span>
                <span class="num">{money(row.balanceCents)}</span>
              </div>
              <div class="track" aria-hidden="true">
                <span style={{ width: `${(Math.abs(row.balanceCents) / peak) * 100}%` }} class={row.balanceCents < 0 ? "short" : ""} />
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="route-heading">
        <h2 id="route-heading">Route the full amount</h2>
        <form>
          <label>
            Amount
            <input value={amount} onInput={(event) => setAmount(event.currentTarget.value)} inputMode="decimal" />
          </label>
          <label>
            From
            <select value={source} onChange={(event) => setSource(event.currentTarget.value)}>
              {nodes.map((node) => <option key={node} value={node}>{node}</option>)}
            </select>
          </label>
          <label>
            To
            <select value={target} onChange={(event) => setTarget(event.currentTarget.value)}>
              {nodes.map((node) => <option key={node} value={node}>{node}</option>)}
            </select>
          </label>
          <label>
            Start
            <input value={start} onInput={(event) => setStart(event.currentTarget.value)} />
          </label>
          <label>
            Deadline
            <input value={deadline} onInput={(event) => setDeadline(event.currentTarget.value)} />
          </label>
        </form>
        {routed.error ? <p class="empty" role="alert">{routed.error}</p> : <RouteList routes={routed.routes} />}
      </section>
    </main>
  );
}
