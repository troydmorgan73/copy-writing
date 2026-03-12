export default function Home() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1>RA Product Audit</h1>
      <p>This service runs a daily product description audit via <code>/api/audit</code>.</p>
      <p>Results are written to Google Sheets.</p>
    </main>
  );
}
