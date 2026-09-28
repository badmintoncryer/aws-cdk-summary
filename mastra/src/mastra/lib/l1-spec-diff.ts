// L1 更新PRの本文は途中で切れるため、新旧のスペックDBを npm から取得して差分を計算する（経緯は docs/l1-spec-diff-design.md）
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { DbDiff } from "@aws-cdk/service-spec-importers";
// DiffFormatter はパッケージのルートから export されていないので lib から直接読む。版を上げたらこのパスが残っているか確かめる
import { DiffFormatter } from "@aws-cdk/service-spec-importers/lib/diff-fmt.js";
import {
  loadDatabase,
  RichPropertyType,
  type Property,
  type SpecDatabase,
  type SpecDatabaseDiff,
  type UpdatedProperty,
} from "@aws-cdk/service-spec-types";

export interface L1Changes {
  newServices: string[];
  /** 既存サービスに追加されたリソース（新規サービス配下のリソースは含まない） */
  newResources: { resource: string; description: string }[];
  /** リソースの properties に追加されたプロパティ（削除・型の変更は breakingChanges に入る） */
  propertyChanges: { resource: string; property: string; description: string }[];
  /** 既存の型に追加されたプロパティ（新しく追加された型そのものは含まない） */
  typePropertyChanges: {
    resource: string;
    type: string;
    property: string;
    description: string;
  }[];
  breakingChanges: string[];
}

const execFileAsync = promisify(execFile);

/**
 * packages/aws-cdk-lib/package.json の patch から、スペックの新旧の版を取り出す。
 * 版が変わっていなければ undefined を返す。
 */
export function parseSpecBump(patch: string) {
  const oldVersion = patch.match(/^-\s*"@aws-cdk\/aws-service-spec": "(\d+\.\d+\.\d+)"/m)?.[1];
  const newVersion = patch.match(/^\+\s*"@aws-cdk\/aws-service-spec": "(\d+\.\d+\.\d+)"/m)?.[1];
  return oldVersion && newVersion && oldVersion !== newVersion
    ? { oldVersion, newVersion }
    : undefined;
}

/** npm レジストリから指定版の db.json.gz を取得し、整合性ハッシュを検証してから読み込む */
async function loadSpecDb(version: string): Promise<SpecDatabase> {
  const meta = await fetchOk(`https://registry.npmjs.org/@aws-cdk/aws-service-spec/${version}`);
  const { tarball, integrity } = (await meta.json()).dist as { tarball: string; integrity: string };
  const tgz = Buffer.from(await (await fetchOk(tarball)).arrayBuffer());

  const separator = integrity.indexOf("-");
  const algorithm = integrity.slice(0, separator);
  if (createHash(algorithm).update(tgz).digest("base64") !== integrity.slice(separator + 1)) {
    throw new Error(`@aws-cdk/aws-service-spec@${version} の整合性ハッシュが一致しません`);
  }

  const dir = await mkdtemp(path.join(tmpdir(), "aws-service-spec-"));
  try {
    const tgzPath = path.join(dir, "spec.tgz");
    await writeFile(tgzPath, tgz);
    await execFileAsync("tar", ["-xzf", tgzPath, "-C", dir, "package/db.json.gz"]);
    return await loadDatabase(path.join(dir, "package/db.json.gz"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function fetchOk(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

/** 2 つの版のスペックを比べ、抽出した変更と diff-db と同じ形式の全文テキストを返す */
export async function diffSpecVersions(oldVersion: string, newVersion: string) {
  // DB 1 つで百数十 MB 使うので、並列にせず順に読む
  const oldDb = await loadSpecDb(oldVersion);
  const newDb = await loadSpecDb(newVersion);
  const diff = new DbDiff(oldDb, newDb).diff();
  return {
    changes: extractChanges(diff, oldDb, newDb),
    fullText: new DiffFormatter(oldDb, newDb).format(diff),
  };
}

export function extractChanges(
  diff: SpecDatabaseDiff,
  oldDb: SpecDatabase,
  newDb: SpecDatabase
): L1Changes {
  const changes: L1Changes = {
    newServices: [],
    newResources: [],
    propertyChanges: [],
    typePropertyChanges: [],
    breakingChanges: [],
  };
  const breaking = (...messages: string[]) => changes.breakingChanges.push(...messages);

  for (const service of Object.values(diff.services.added ?? {})) {
    changes.newServices.push(service.cloudFormationNamespace ?? service.name);
  }
  for (const service of Object.values(diff.services.removed ?? {})) {
    breaking(`${service.cloudFormationNamespace ?? service.name} サービスが削除されました`);
  }

  for (const service of Object.values(diff.services.updated ?? {})) {
    const resources = service.resourceDiff ?? {};
    for (const r of Object.values(resources.added ?? {})) {
      changes.newResources.push({ resource: r.cloudFormationType, description: r.documentation ?? "" });
    }
    for (const r of Object.values(resources.removed ?? {})) {
      breaking(`${r.cloudFormationType} リソースが削除されました`);
    }

    for (const [resource, r] of Object.entries(resources.updated ?? {})) {
      for (const [property, p] of Object.entries(r.properties?.added ?? {})) {
        changes.propertyChanges.push({ resource, property, description: p.documentation ?? "" });
      }
      for (const property of Object.keys(r.properties?.removed ?? {})) {
        breaking(`${resource} の ${property} プロパティが削除されました`);
      }
      for (const [property, u] of Object.entries(r.properties?.updated ?? {})) {
        breaking(...propertyBreaks(`${resource} の ${property} プロパティ`, u, oldDb, newDb));
      }
      for (const attribute of Object.keys(r.attributes?.removed ?? {})) {
        breaking(`${resource} の ${attribute} 属性が削除されました`);
      }
      if (r.primaryIdentifier) {
        const { old = [], new: next = [] } = r.primaryIdentifier;
        breaking(`${resource} の primaryIdentifier が [${old.join(", ")}] から [${next.join(", ")}] に変わりました`);
      }

      for (const [type, t] of Object.entries(r.typeDefinitionDiff?.updated ?? {})) {
        for (const [property, p] of Object.entries(t.properties?.added ?? {})) {
          changes.typePropertyChanges.push({ resource, type, property, description: p.documentation ?? "" });
        }
        for (const property of Object.keys(t.properties?.removed ?? {})) {
          breaking(`${resource} の型 ${type} から ${property} プロパティが削除されました`);
        }
        for (const [property, u] of Object.entries(t.properties?.updated ?? {})) {
          breaking(...propertyBreaks(`${resource} の型 ${type} の ${property} プロパティ`, u, oldDb, newDb));
        }
      }
    }
  }

  return changes;
}

/** 旧版で受け付けていた型が新版で受け付けられない、または任意から必須になった場合を破壊的変更とする */
function propertyBreaks(
  label: string,
  { old, new: next }: UpdatedProperty,
  oldDb: SpecDatabase,
  newDb: SpecDatabase
) {
  const messages: string[] = [];
  const oldTypes = acceptedTypes(old, oldDb);
  const newTypes = acceptedTypes(next, newDb);
  if (oldTypes.some((t) => !newTypes.includes(t))) {
    messages.push(`${label}の型が ${oldTypes.join(" | ")} から ${newTypes.join(" | ")} に変わりました`);
  }
  if (!old.required && next.required) {
    messages.push(`${label}が必須になりました`);
  }
  return messages;
}

/**
 * プロパティが受け付ける型（現在の型と previousTypes）を文字列で返す。
 * 型参照の ID は DB ごとに振り直されるので、DbDiff と同じく DB を引いて型名に直す。
 * L1 では選択肢つきの文字列（string<A|B>）も string として扱われるため、選択肢は落とす。
 */
function acceptedTypes(property: Property, db: SpecDatabase) {
  return [property.type, ...(property.previousTypes ?? [])].map((t) =>
    new RichPropertyType(t).normalize(db).stringify(db, false).replace(/string<[^<>]*>/g, "string")
  );
}
