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
      // List objects to find the matching file regardless of naming pattern
      const listCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: "reports/l1-updates/",
      });

      const listResponse = await s3Client.send(listCommand);
      const datePattern = new RegExp(`l1-(?:summary-)?${date}\\.json$`);
      const matchingKey = (listResponse.Contents || []).find(
        (obj) => obj.Key && datePattern.test(obj.Key)
      )?.Key;

      if (!matchingKey) {
        return NextResponse.json(
          { error: "L1 update summary not found" },
          { status: 404 }
        );
      }

      const getCommand = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: matchingKey,
      });

      const getResponse = await s3Client.send(getCommand);
      const body = await getResponse.Body?.transformToString();

      if (!body) {
        return NextResponse.json(
          { error: "Failed to read L1 update summary" },
          { status: 500 }
        );
      }

      return NextResponse.json(JSON.parse(body));
    }

    // List all available L1 update summaries
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: "reports/l1-updates/",
    });

    const response = await s3Client.send(command);
    const summaries: { date: string; key: string; lastModified: string }[] =
      [];

    for (const obj of response.Contents || []) {
      if (obj.Key && obj.Key.endsWith(".json")) {
        const match = obj.Key.match(/l1-(?:summary-)?(\d{4}-\d{2}-\d{2})\.json$/);
        if (match) {
          summaries.push({
            date: match[1],
            key: obj.Key,
            lastModified: obj.LastModified?.toISOString() || "",
          });
        }
      }
    }

    // 日付（YYYY-MM-DD）で降順ソート
    summaries.sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({ summaries });
  } catch (error) {
    console.error("Error fetching L1 update summaries:", error);
    return NextResponse.json(
      { error: "Failed to fetch L1 update summaries" },
      { status: 500 }
    );
  }
}
