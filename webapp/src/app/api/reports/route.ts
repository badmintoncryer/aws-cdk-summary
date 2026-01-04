import { NextResponse } from "next/server";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

const s3Client = new S3Client({});
const BUCKET_NAME = process.env.REPORT_BUCKET_NAME || "";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  try {
    if (date) {
      // Get specific report by date
      const listCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: "reports/",
      });

      const listResponse = await s3Client.send(listCommand);
      const targetFile = listResponse.Contents?.find(
        (obj) => obj.Key?.includes(`cdk-report-${date}.json`)
      );

      if (!targetFile?.Key) {
        return NextResponse.json(
          { error: "Report not found" },
          { status: 404 }
        );
      }

      const getCommand = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: targetFile.Key,
      });

      const getResponse = await s3Client.send(getCommand);
      const body = await getResponse.Body?.transformToString();

      if (!body) {
        return NextResponse.json(
          { error: "Failed to read report" },
          { status: 500 }
        );
      }

      return NextResponse.json(JSON.parse(body));
    }

    // List all available reports
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: "reports/",
    });

    const response = await s3Client.send(command);
    const reports: { date: string; key: string; lastModified: string }[] = [];

    for (const obj of response.Contents || []) {
      if (obj.Key && obj.Key.endsWith(".json")) {
        const match = obj.Key.match(/cdk-report-(\d{4}-\d{2}-\d{2})\.json$/);
        if (match) {
          reports.push({
            date: match[1],
            key: obj.Key,
            lastModified: obj.LastModified?.toISOString() || "",
          });
        }
      }
    }

    // 日付（YYYY-MM-DD）で降順ソート
    reports.sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({ reports });
  } catch (error) {
    console.error("Error fetching reports:", error);
    return NextResponse.json(
      { error: "Failed to fetch reports" },
      { status: 500 }
    );
  }
}
