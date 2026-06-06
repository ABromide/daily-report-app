import DailyReportCore
import Foundation

let sampleJSONString = """
{
  "manifest": {
    "version": 1,
    "generatedAt": "2026-06-06T02:00:00Z",
    "latestDay": "2026-06-06",
    "manifestPath": "manifests/smoke.manifest.json",
    "manifestSHA256": "smoke",
    "root": "public",
    "totalFiles": 3,
    "totalBytes": 1024,
    "dataBranchRef": "data@smoke",
    "publicBaseURL": "https://example.com/daily-report/public/"
  },
  "generatedAt": "2026-06-06T02:00:00Z",
  "dataMode": "fixture",
  "dataPath": "inline smoke",
  "repoURL": "https://github.com/ABromide/daily-report-app",
  "stats": [
    {
      "id": "fixed-channels",
      "label": "固定分类",
      "value": "3"
    }
  ],
  "clusters": [
    {
      "id": "llm-agent",
      "title": "大模型 Agent 相关",
      "thesis": "Tracks tool use.",
      "summary": "Smoke cluster.",
      "tags": ["Agent"],
      "documentCount": 1,
      "lastUpdatedAt": "2026-06-06T01:59:00Z"
    }
  ],
  "documents": [
    {
      "id": "smoke-document",
      "clusterID": "llm-agent",
      "type": "code",
      "typeLabel": "代码",
      "title": "Smoke model decode",
      "summary": "Inline JSON should decode into the public DailyReportPayload contract.",
      "analysis": "",
      "sourceName": "Inline fixture",
      "url": "https://example.com/smoke",
      "publishedAt": "2026-06-06T01:59:00Z",
      "readingMinutes": 1,
      "score": 80,
      "tags": ["smoke", "swift"],
      "domain": "example.com",
      "analysisMarkdownPath": "articles/smoke/index.md",
      "analysisMarkdown": "# Smoke\\n\\nThe smoke executable checks Codable models, cache replacement, and public-data import behavior.",
      "searchText": "smoke swift agent code",
      "evidence": [
        {
          "id": "smoke-source",
          "title": "Inline fixture",
          "url": "https://example.com/smoke",
          "host": "example.com",
          "capturedAt": "2026-06-06T01:58:00Z",
          "checksumSHA256": "smoke"
        }
      ]
    }
  ],
  "sources": [
    {
      "id": "smoke-source",
      "name": "Smoke fixture",
      "kind": "manual",
      "homepageURL": "https://example.com/smoke",
      "note": "Inline smoke data.",
      "enabled": true,
      "itemCount": 1
    }
  ]
}
"""

@main
struct DailyReportSmoke {
    static func main() async throws {
        let sampleData = Data(sampleJSONString.utf8)
        let payload = try DailyReportJSON.decoder.decode(DailyReportPayload.self, from: sampleData)

        precondition(payload.manifest.version == 1)
        precondition(payload.clusters.first?.id == .llmAgent)
        precondition(payload.documents.count == 1)
        precondition(payload.documents[0].evidence.count == 1)

        let cacheDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("DailyReportSmoke-\(UUID().uuidString)", isDirectory: true)
        let store = SummaryCacheStore(cacheDirectory: cacheDirectory)
        let importer = ImportService(store: store)

        let localResult = try await importer.importPayload(
            from: .data(sampleData),
            status: .localOnly
        )
        precondition(localResult.importedDocumentCount == 1)
        precondition(localResult.summary.status == .localOnly)

        let cached = try await store.load()
        precondition(cached?.payload.documents.first?.id == "smoke-document")
        precondition(cached?.status == .localOnly)

        let bundledPayload = try DailyReportJSON.decoder.decode(
            DailyReportPayload.self,
            from: ImportService.bundledFixtureData()
        )
        precondition(bundledPayload.documents.count >= 3)
        precondition(bundledPayload.clusters.count == 3)

        if let publicDataDirectory = PublicDataLoader.discoverLocalPublicDataDirectory() {
            let fixtureResult = try await importer.importPayload(from: .publicDataDirectory(publicDataDirectory))
            precondition(fixtureResult.summary.status == .cached)
            precondition(fixtureResult.importedDocumentCount >= 3)
            precondition(fixtureResult.summary.payload.documents.first?.analysisMarkdown != nil)

            print("DailyReportSmoke passed: decoded inline payload, bundled sample, and public-data fixture with \(fixtureResult.importedDocumentCount) documents.")
        } else {
            let fixtureResult = try await importer.importPayload(from: .bundledFixture)
            precondition(fixtureResult.summary.status == .cached)
            precondition(fixtureResult.importedDocumentCount >= 3)

            print("DailyReportSmoke passed: decoded inline payload and bundled sample with \(fixtureResult.importedDocumentCount) documents.")
        }
    }
}
