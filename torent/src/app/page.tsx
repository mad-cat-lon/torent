"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import Papa from "papaparse";
import Fuse from "fuse.js";

/** Bylaw CSV row from Addresses.csv */
interface ByLawAddressRow {
  AddrLine: string;
  INVESTIGATION_ID: string;
}

/** Investigations.csv */
interface InvestigationRow {
  INVESTIGATION_ID: string;
  Issue?: string;
  InType?: string;
  Status?: string;
  InDate?: string;
}

/** Deficiencies.csv */
interface DeficiencyRow {
  INVESTIGATION_ID: string;
  Desc?: string;
  Status?: string;
}

/** Highrise_Inspections_Data.csv */
interface FireInspectionRow {
  PropertyAddress?: string;
  INSPECTIONS_OPENDATE?: string;
  VIOLATION_DESCRIPTION?: string;
}

/** Data for bar charts */
interface CombinedData {
  Address: string;
  Status?: string;
  Month?: string;
  Count: number;
}

// CSV endpoints
const BYLAW_ADDRS_ENDPOINT =
  "https://raw.githubusercontent.com/mad-cat-lon/torent/refs/heads/main/data/bylaw/Addresses.csv";
const BYLAW_INVGS_ENDPOINT =
  "https://raw.githubusercontent.com/mad-cat-lon/torent/refs/heads/main/data/bylaw/Investigations.csv";
const BYLAW_DEFCS_ENDPOINT =
  "https://raw.githubusercontent.com/mad-cat-lon/torent/refs/heads/main/data/bylaw/Deficiencies.csv";
const FIRE_INSPECS_ENDPOINT =
  "https://raw.githubusercontent.com/mad-cat-lon/torent/refs/heads/main/data/fire/Highrise_Inspections_Data.csv";

export default function Home() {
  const [addressInput, setAddressInput] = useState("");
  const [foundAddress, setFoundAddress] = useState("");
  const [results, setResults] = useState<CombinedData[]>([]);
  const [loading, setLoading] = useState(false);

  const [investigationsList, setInvestigationsList] = useState<InvestigationRow[]>([]);
  const [deficienciesList, setDeficienciesList] = useState<DeficiencyRow[]>([]);
  const [fireInspectionsList, setFireInspectionsList] = useState<FireInspectionRow[]>([]);

  // Raw CSV data
  const [bylawAddresses, setBylawAddresses] = useState<ByLawAddressRow[]>([]);
  const [bylawInvestigations, setBylawInvestigations] = useState<InvestigationRow[]>([]);
  const [bylawDeficiencies, setBylawDeficiencies] = useState<DeficiencyRow[]>([]);
  const [fireInspections, setFireInspections] = useState<FireInspectionRow[]>([]);

  // 1) Load CSV data on mount
  useEffect(() => {
    async function fetchCSVData(url: string) {
      const response = await fetch(url);
      const text = await response.text();
      return new Promise<any[]>((resolve) => {
        Papa.parse(text, {
          header: true,
          complete: (result) => {
            resolve(result.data);
          },
        });
      });
    }

    (async () => {
      setBylawAddresses((await fetchCSVData(BYLAW_ADDRS_ENDPOINT)) as ByLawAddressRow[]);
      setBylawInvestigations((await fetchCSVData(BYLAW_INVGS_ENDPOINT)) as InvestigationRow[]);
      setBylawDeficiencies((await fetchCSVData(BYLAW_DEFCS_ENDPOINT)) as DeficiencyRow[]);
      setFireInspections((await fetchCSVData(FIRE_INSPECS_ENDPOINT)) as FireInspectionRow[]);
    })();
  }, []);

  // 2) Main search function
  const searchAddress = async () => {
    setLoading(true);
    setResults([]);
    setFoundAddress("");
    setInvestigationsList([]);
    setDeficienciesList([]);
    setFireInspectionsList([]);

    // A) Fuzzy match address
    const fuse = new Fuse(bylawAddresses, { keys: ["AddrLine"], threshold: 0.4 });
    const fuseResults = fuse.search(addressInput.toUpperCase());
    if (fuseResults.length === 0) {
      setLoading(false);
      return;
    }

    const bestMatchAddr = fuseResults[0].item.AddrLine?.toUpperCase() || "";
    setFoundAddress(bestMatchAddr);

    const matchingAddrRows = bylawAddresses.filter(
      (row) => row.AddrLine?.toUpperCase() === bestMatchAddr
    );
    const invIDs = matchingAddrRows.map((row) => row.INVESTIGATION_ID);

    // B) Filter Investigations & Deficiencies
    const matchingInvestigations = bylawInvestigations.filter((inv) =>
      invIDs.includes(inv.INVESTIGATION_ID)
    );
    const matchingDeficiencies = bylawDeficiencies.filter((def) =>
      invIDs.includes(def.INVESTIGATION_ID)
    );

    setInvestigationsList(matchingInvestigations);
    setDeficienciesList(matchingDeficiencies);

    // Summaries for bar chart
    const investigationCounts = matchingInvestigations.reduce((acc: Record<string, number>, item) => {
      if (item.Status) {
        acc[item.Status] = (acc[item.Status] || 0) + 1;
      }
      return acc;
    }, {});
    const deficiencyCounts = matchingDeficiencies.reduce((acc: Record<string, number>, item) => {
      if (item.Status) {
        acc[item.Status] = (acc[item.Status] || 0) + 1;
      }
      return acc;
    }, {});

    // C) Fuzzy match Fire
    const fireFuse = new Fuse(fireInspections, { keys: ["PropertyAddress"], threshold: 0.4 });
    const fireFuseResults = fireFuse.search(addressInput.toUpperCase());
    let matchingFireRows: FireInspectionRow[] = [];

    if (fireFuseResults.length > 0) {
      const bestFireMatch = fireFuseResults[0].item.PropertyAddress?.toUpperCase();
      matchingFireRows = fireInspections.filter(
        (row) => row.PropertyAddress?.toUpperCase() === bestFireMatch
      );
    }

    // Sort fire rows by date
    matchingFireRows.sort((a, b) => {
      const dateA = a.INSPECTIONS_OPENDATE ? new Date(a.INSPECTIONS_OPENDATE).getTime() : 0;
      const dateB = b.INSPECTIONS_OPENDATE ? new Date(b.INSPECTIONS_OPENDATE).getTime() : 0;
      return dateA - dateB;
    });
    setFireInspectionsList(matchingFireRows);

    // Summarize Fire data by Month
    const fireCounts = matchingFireRows.reduce((acc: Record<string, number>, item) => {
      if (item.INSPECTIONS_OPENDATE) {
        const [yyyy, mm] = item.INSPECTIONS_OPENDATE.split("-");
        const yearMonth = `${yyyy}-${mm}`;
        acc[yearMonth] = (acc[yearMonth] || 0) + 1;
      }
      return acc;
    }, {});

    // D) Build timeline for investigations by date
    const investigationsOverTime = matchingInvestigations.reduce(
      (acc: Record<string, number>, item) => {
        if (item.InDate) {
          const dateString = item.InDate.slice(0, 10);
          acc[dateString] = (acc[dateString] || 0) + 1;
        }
        return acc;
      },
      {}
    );
    // E) Merge data for bar charts
    const combinedData: CombinedData[] = [
      // Bylaw investigation statuses
      ...Object.entries(investigationCounts).map(([status, count]) => ({
        Address: bestMatchAddr,
        Status: status,
        Count: count,
      })),
      // Bylaw deficiency statuses
      ...Object.entries(deficiencyCounts).map(([status, count]) => ({
        Address: bestMatchAddr,
        Status: status,
        Count: count,
      })),
      // Fire code monthly
      ...Object.entries(fireCounts).map(([month, count]) => ({
        Address: bestMatchAddr,
        Month: month,
        Count: count,
      })),
    ];

    setResults(combinedData);

    setLoading(false);
  };

  return (
    <div className="w-full min-h-screen bg-gray-50 p-4">
      <h1 className="text-3xl font-bold mb-6">Toronto Highrise Safety Check</h1>

      <div className="flex gap-6">
        {/* LEFT COLUMN (Search, etc.) */}
        <div className="w-1/6 bg-white p-4 rounded-md shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Search</h2>
          <div className="space-y-3">
            <Input
              placeholder="Enter Address"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
            />
            <Button onClick={searchAddress} disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </Button>
          </div>
        </div>

        <div className="flex-1">
          {results.length === 0 && !loading && (
            <p className="text-gray-600">No results yet. Please enter an address.</p>
          )}

          {results.length > 0 && (
            <section className="space-y-6">
              <h2 className="text-xl font-semibold">Results for {foundAddress}</h2>

              {/* Recharts Summary row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Bylaw Issues */}
                <Card>
                  <CardHeader>
                    <CardTitle>Bylaw Issues (Status Summary)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={results.filter((d) => d.Status)}>
                        <XAxis dataKey="Status" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="Count" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Fire Violations */}
                <Card>
                  <CardHeader>
                    <CardTitle>Fire Violations (Monthly)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={results.filter((d) => d.Month)}>
                        <XAxis dataKey="Month" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="Count" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* {investigationsList.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Investigations Over Time</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      // Group by date
                      const dateCounts = investigationsList.reduce(
                        (acc: Record<string, number>, item) => {
                          if (item.InDate) {
                            const dateOnly = item.InDate.slice(0, 11);
                            acc[dateOnly] = (acc[dateOnly] || 0) + 1;
                          }
                          return acc;
                        },
                        {}
                      );
                      // Convert to array & sort
                      const dataArray = Object.entries(dateCounts)
                        .map(([date, count]) => ({ date, count }))
                        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                      return (
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart data={dataArray}>
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Line dataKey="count" />
                          </LineChart>
                        </ResponsiveContainer>
                      );
                    })()}
                  </CardContent>
                </Card>
              )} */}

              {/* Detailed Tables */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold mb-2">Bylaw Investigations</h3>
                  {investigationsList.length > 0 ? (
                    <div className="overflow-auto">
                      <table className="table-auto w-full border">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-4 py-2">Issue</th>
                            <th className="px-4 py-2">InType</th>
                            <th className="px-4 py-2">Status</th>
                            <th className="px-4 py-2">InDate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {investigationsList.map((inv, idx) => (
                            <tr key={`${inv.INVESTIGATION_ID}-${idx}`}>
                              <td className="border px-4 py-2">{inv.Issue}</td>
                              <td className="border px-4 py-2">{inv.InType}</td>
                              <td className="border px-4 py-2">{inv.Status}</td>
                              <td className="border px-4 py-2">{inv.InDate}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p>No investigations found.</p>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-bold mb-2">Bylaw Deficiencies</h3>
                  {deficienciesList.length > 0 ? (
                    <div className="overflow-auto">
                      <table className="table-auto w-full border">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-4 py-2">Desc</th>
                            <th className="px-4 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deficienciesList.map((def, idx) => (
                            <tr key={`${def.INVESTIGATION_ID}-${idx}`}>
                              <td className="border px-4 py-2">{def.Desc}</td>
                              <td className="border px-4 py-2">{def.Status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p>No deficiencies found.</p>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-bold mb-2">Fire Code Violations</h3>
                  {fireInspectionsList.length > 0 ? (
                    <div className="overflow-auto">
                      <table className="table-auto w-full border">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-4 py-2">INSPECTIONS_OPENDATE</th>
                            <th className="px-4 py-2">VIOLATION_DESCRIPTION</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fireInspectionsList.map((row, idx) => (
                            <tr key={idx}>
                              <td className="border px-4 py-2">
                                {row.INSPECTIONS_OPENDATE}
                              </td>
                              <td className="border px-4 py-2">
                                {row.VIOLATION_DESCRIPTION}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p>No fire code violations found.</p>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
