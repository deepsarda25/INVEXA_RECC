type StockRow = {
  ticker: string;
  price: number;
  ts: number;
};

type Props = {
  rows: StockRow[];
};

export function PriceTable({ rows }: Props) {
  return (
    <div className="card">
      <h2>Live Market</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Price</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.ticker}>
              <td>{row.ticker}</td>
              <td>{row.price.toFixed(2)}</td>
              <td>{new Date(row.ts).toLocaleTimeString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
