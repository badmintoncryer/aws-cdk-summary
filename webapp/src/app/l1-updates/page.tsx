import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { DateSelector } from "../date-selector";
import { ThemeToggle } from "../theme-toggle";
import Link from "next/link";

interface PropertyChange {
  resource: string;
  property: string;
  description: string;
}

interface L1Update {
  prNumber: number;
  title: string;
  url: string;
  mergedAt: string;
  newServices?: string[];
  propertyChanges?: PropertyChange[];
  breakingChanges?: string[];
}

interface L1UpdateSummary {
  generatedAt: string;
  reportDate: string;
  l1Updates: L1Update[];
}

interface SummaryFile {
  key: string;
  date: string;
  lastModified: Date;
}

const s3Client = new S3Client({});
const BUCKET_NAME = process.env.REPORT_BUCKET_NAME || "";

async function getL1SummaryList(): Promise<SummaryFile[]> {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: "reports/l1-updates/",
  });

  const response = await s3Client.send(command);
  const files: SummaryFile[] = [];

  for (const obj of response.Contents || []) {
    if (obj.Key && obj.Key.endsWith(".json")) {
      const match = obj.Key.match(/l1-(\d{4}-\d{2}-\d{2})\.json$/);
      if (match) {
        files.push({
          key: obj.Key,
          date: match[1],
          lastModified: obj.LastModified || new Date(),
        });
      }
    }
  }

  // 日付（YYYY-MM-DD）で降順ソート
  return files.sort((a, b) => b.date.localeCompare(a.date));
}

async function getL1Summary(key: string): Promise<L1UpdateSummary | null> {
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

export default async function L1UpdatesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const summaryList = await getL1SummaryList();

  let selectedSummary: L1UpdateSummary | null = null;
  let selectedDate = params.date || summaryList[0]?.date;

  if (selectedDate) {
    const summaryFile = summaryList.find((s) => s.date === selectedDate);
    if (summaryFile) {
      selectedSummary = await getL1Summary(summaryFile.key);
    }
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          {/* Mobile Layout */}
          <div className="flex flex-col gap-3 sm:hidden">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h1 className="text-base font-bold text-gray-900 dark:text-white truncate">L1 Update Summary</h1>
              </div>
              <ThemeToggle />
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="flex-shrink-0 text-xs px-2.5 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300
                          rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors font-medium"
              >
                All
              </Link>
              <div className="flex-1">
                <DateSelector
                  dates={summaryList.map((s) => s.date)}
                  selectedDate={selectedDate || ""}
                />
              </div>
            </div>
          </div>

          {/* Desktop Layout */}
          <div className="hidden sm:flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                L1 Update Summary
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                CloudFormation Resource Specification Updates
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                ← Back to All Reports
              </Link>
              <DateSelector
                dates={summaryList.map((s) => s.date)}
                selectedDate={selectedDate || ""}
              />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {selectedSummary && selectedSummary.l1Updates.length > 0 ? (
          <>
            {/* Summary */}
            <section className="mb-10">
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white shadow-lg">
                <div className="text-4xl font-bold">
                  {selectedSummary.l1Updates.length}
                </div>
                <div className="text-purple-100 mt-1 text-sm font-medium">
                  L1 Updates (CloudFormation Spec Changes)
                </div>
              </div>
            </section>

            {/* L1 Updates List */}
            <section>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
                Updates
              </h2>
              <div className="space-y-6">
                {selectedSummary.l1Updates.map((update) => (
                  <article
                    key={update.prNumber}
                    className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6
                              border-l-4 border-l-purple-500 hover:shadow-md transition-shadow"
                  >
                    {/* PR Header */}
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <a
                        href={update.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-base font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400
                                   transition-colors"
                      >
                        <span className="text-gray-400 dark:text-gray-500 font-normal">
                          #{update.prNumber}
                        </span>{" "}
                        {update.title}
                      </a>
                      <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {new Date(update.mergedAt).toLocaleDateString("ja-JP")}
                      </span>
                    </div>

                    {/* New Services */}
                    {update.newServices && update.newServices.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-2">
                          🎉 New Services Added
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {update.newServices.map((service, i) => (
                            <span
                              key={i}
                              className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300
                                        px-3 py-1 rounded-full text-xs font-medium break-all"
                            >
                              {service}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Property Changes */}
                    {update.propertyChanges &&
                      update.propertyChanges.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-2">
                            ✨ New Properties Added
                          </h4>
                          <div className="space-y-2">
                            {update.propertyChanges.map((change, i) => (
                              <div
                                key={i}
                                className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 overflow-hidden"
                              >
                                <div className="font-mono text-sm text-blue-900 dark:text-blue-300 font-semibold break-all">
                                  {change.resource}
                                </div>
                                <div className="font-mono text-xs text-blue-700 dark:text-blue-400 mt-1 break-all">
                                  {change.property}
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-300 mt-2 break-words">
                                  {change.description}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* Breaking Changes */}
                    {update.breakingChanges &&
                      update.breakingChanges.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2">
                            ⚠️ Breaking Changes
                          </h4>
                          <ul className="space-y-1">
                            {update.breakingChanges.map((change, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300
                                          bg-red-50 dark:bg-red-900/20 rounded p-2"
                              >
                                <span className="text-red-500 dark:text-red-400 mt-0.5">
                                  •
                                </span>
                                {change}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </article>
                ))}
              </div>
            </section>

            {/* Footer */}
            <footer className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700 text-center text-sm text-gray-500 dark:text-gray-400">
              Summary generated at{" "}
              <time className="font-medium">
                {new Date(selectedSummary.generatedAt).toLocaleString("ja-JP")}
              </time>
            </footer>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-gray-400 dark:text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-lg">
              {summaryList.length === 0
                ? "No L1 update summaries available yet."
                : "No L1 updates found for this date."}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
