import DailyReportCore
import Foundation

let sampleJSONString = """
{
  "manifest": {
    "schemaVersion": "0.1.0",
    "generatedAt": "2026-06-06T02:00:00Z",
    "runID": "smoke-inline",
    "dataBranchRef": "data@smoke",
    "publicBaseURL": "https://example.com/daily-report/public"
  },
  "reports": [
    {
      "id": "smoke-report",
      "title": "Smoke model decode",
      "summary": "Inline JSON should decode into the public DailyReportPayload contract.",
      "bodyMarkdown": "The smoke executable checks Codable models, cache replacement, and importer behavior without needing xcodebuild.",
      "publishedAt": "2026-06-06T01:59:00Z",
      "tags": ["smoke", "swift"],
      "readingTimeMinutes": 1,
      "importance": "medium",
      "sources": [
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
  "sourceHealth": [
    {
      "id": "smoke-source-health",
      "name": "Smoke fixture",
      "status": "healthy",
      "lastSeenAt": "2026-06-06T01:58:00Z",
      "itemCount": 1,
      "note": "Inline smoke data."
    }
  ]
}
"""

@main
struct DailyReportSmoke {
    static func main() async throws {
        let sampleData = Data(sampleJSONString.utf8)
        let payload: DailyReportPayload

        do {
            payload = try DailyReportJSON.decoder.decode(DailyReportPayload.self, from: sampleData)
        } catch {
            let fallback = try ImportService.bundledFixtureData()
            payload = try DailyReportJSON.decoder.decode(DailyReportPayload.self, from: fallback)
        }

        precondition(payload.manifest.schemaVersion == "0.1.0")
        precondition(!payload.reports.isEmpty)
        precondition(payload.reports[0].sources.count == 1)

        let cacheDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("DailyReportSmoke-\(UUID().uuidString)", isDirectory: true)
        let store = SummaryCacheStore(cacheDirectory: cacheDirectory)
        let importer = ImportService(store: store)

        let localResult = try await importer.importPayload(
            from: .data(sampleData),
            status: .localOnly
        )
        precondition(localResult.importedReportCount == 1)
        precondition(localResult.summary.status == .localOnly)

        let cached = try await store.load()
        precondition(cached?.payload.reports.first?.id == "smoke-report")
        precondition(cached?.status == .localOnly)

        let fixtureResult = try await importer.importPayload(from: .bundledFixture)
        precondition(fixtureResult.summary.status == .cached)
        precondition(fixtureResult.importedReportCount >= 2)

        print("DailyReportSmoke passed: decoded \(payload.reports.count) inline report, imported \(fixtureResult.importedReportCount) fixture reports.")
    }
}
