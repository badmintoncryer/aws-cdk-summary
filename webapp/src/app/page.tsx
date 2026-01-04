import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { DateSelector } from "./date-selector";

interface PullRequest {
  number: number;
  title: string;
  url: string;
  author: string;
  createdAt: string;
  mergedAt: string;
  labels: string[];
  category: string;
  summary: string;
  keyPoints: string[];
  files: {
    added: number;
    modified: number;
    removed: number;
  };
}

interface CdkReport {
  generatedAt: string;
  period: {
    from: string;
    to: string;
  };
  summary: {
    totalPRs: number;
    categories: Record<string, number>;
  };
  pullRequests: PullRequest[];
}

interface ReportFile {
  key: string;
  date: string;
  lastModified: Date;
}

const s3Client = new S3Client({});
const BUCKET_NAME = process.env.REPORT_BUCKET_NAME || "";

async function getReportList(): Promise<ReportFile[]> {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: "reports/",
  });

  const response = await s3Client.send(command);
  const files: ReportFile[] = [];

  for (const obj of response.Contents || []) {
    if (obj.Key && obj.Key.endsWith(".json")) {
      const match = obj.Key.match(/cdk-report-(\d{4}-\d{2}-\d{2})\.json$/);
      if (match) {
        files.push({
          key: obj.Key,
          date: match[1],
          lastModified: obj.LastModified || new Date(),
        });
      }
    }
  }

  return files.sort(
    (a, b) => b.lastModified.getTime() - a.lastModified.getTime()
  );
}

async function getReport(key: string): Promise<CdkReport | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);
    const body = await response.Body?.transformToString();
    return body ? JSON.parse(body) : null;
  } catch {
    return null;
  }
}

const categoryStyles: Record<string, { bg: string; text: string; border: string }> = {
  feat: { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-l-emerald-500" },
  fix: { bg: "bg-red-100", text: "text-red-700", border: "border-l-red-500" },
  docs: { bg: "bg-slate-100", text: "text-slate-700", border: "border-l-slate-500" },
  chore: { bg: "bg-cyan-100", text: "text-cyan-700", border: "border-l-cyan-500" },
  refactor: { bg: "bg-orange-100", text: "text-orange-700", border: "border-l-orange-500" },
  test: { bg: "bg-purple-100", text: "text-purple-700", border: "border-l-purple-500" },
  ci: { bg: "bg-teal-100", text: "text-teal-700", border: "border-l-teal-500" },
};

function getCategoryStyle(category: string) {
  return categoryStyles[category] || { bg: "bg-gray-100", text: "text-gray-700", border: "border-l-gray-500" };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const reportList = await getReportList();

  let selectedReport: CdkReport | null = null;
  let selectedDate = params.date || reportList[0]?.date;

  if (selectedDate) {
    const reportFile = reportList.find((r) => r.date === selectedDate);
    if (reportFile) {
      selectedReport = await getReport(reportFile.key);
    }
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-gray-900">AWS CDK Daily Summary</h1>
            <p className="text-sm text-gray-500 mt-0.5">Pull Request Analysis Report</p>
          </div>
          <DateSelector
            dates={reportList.map((r) => r.date)}
            selectedDate={selectedDate || ""}
          />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {selectedReport ? (
          <>
            {/* Summary Cards */}
            <section className="mb-10">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Overview</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {/* Total PRs Card */}
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-5 text-white shadow-lg col-span-2">
                  <div className="text-4xl font-bold">{selectedReport.summary.totalPRs}</div>
                  <div className="text-blue-100 mt-1 text-sm font-medium">Total Pull Requests</div>
                </div>

                {/* Category Cards */}
                {Object.entries(selectedReport.summary.categories).map(([category, count]) => {
                  const style = getCategoryStyle(category);
                  return (
                    <div
                      key={category}
                      className={`${style.bg} rounded-xl p-4 border-l-4 ${style.border}`}
                    >
                      <div className={`text-2xl font-bold ${style.text}`}>{count}</div>
                      <div className="text-gray-600 mt-1 text-sm capitalize">{category}</div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Pull Requests List */}
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Pull Requests</h2>
              <div className="space-y-4">
                {selectedReport.pullRequests.map((pr) => {
                  const style = getCategoryStyle(pr.category);
                  return (
                    <article
                      key={pr.number}
                      className={`bg-white rounded-xl shadow-sm border border-gray-100 p-6
                                  border-l-4 ${style.border} hover:shadow-md transition-shadow`}
                    >
                      {/* PR Header */}
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <a
                          href={pr.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-base font-semibold text-gray-900 hover:text-blue-600
                                     transition-colors line-clamp-2"
                        >
                          <span className="text-gray-400 font-normal">#{pr.number}</span>{" "}
                          {pr.title}
                        </a>
                        <span
                          className={`${style.bg} ${style.text} px-3 py-1 rounded-full
                                      text-xs font-semibold whitespace-nowrap`}
                        >
                          {pr.category}
                        </span>
                      </div>

                      {/* PR Meta */}
                      <div className="flex items-center gap-3 text-sm text-gray-500 mb-4">
                        <a
                          href={`https://github.com/${pr.author}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 hover:text-blue-600 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                          </svg>
                          @{pr.author}
                        </a>
                        <span className="text-gray-300">|</span>
                        <span className="flex items-center gap-1" title="発行日">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                          </svg>
                          {new Date(pr.createdAt).toLocaleDateString("ja-JP")}
                        </span>
                      </div>

                      {/* PR Summary */}
                      <p className="text-gray-600 leading-relaxed mb-4">{pr.summary}</p>

                      {/* Key Points */}
                      {pr.keyPoints.length > 0 && (
                        <ul className="space-y-2 mb-4">
                          {pr.keyPoints.map((point, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                              <span className="text-blue-500 mt-1">•</span>
                              {point}
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* File Changes */}
                      <div className="flex items-center gap-4 pt-4 border-t border-gray-100">
                        <span className="text-sm text-emerald-600 font-medium">
                          +{pr.files.added} added
                        </span>
                        <span className="text-sm text-orange-600 font-medium">
                          ~{pr.files.modified} modified
                        </span>
                        <span className="text-sm text-red-600 font-medium">
                          -{pr.files.removed} removed
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            {/* Footer */}
            <footer className="mt-12 pt-6 border-t border-gray-200 text-center text-sm text-gray-500">
              Report generated at{" "}
              <time className="font-medium">
                {new Date(selectedReport.generatedAt).toLocaleString("ja-JP")}
              </time>
            </footer>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-gray-500 text-lg">
              {reportList.length === 0
                ? "No reports available yet."
                : "Failed to load report."}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
