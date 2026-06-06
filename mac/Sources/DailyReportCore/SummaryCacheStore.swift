import Foundation

public actor SummaryCacheStore {
    private var current: CachedSummary?
    private let cacheDirectory: URL
    private let cacheURL: URL

    public init(cacheDirectory: URL? = nil) {
        let directory = cacheDirectory ?? Self.defaultCacheDirectory()
        self.cacheDirectory = directory
        self.cacheURL = directory.appendingPathComponent("summary-cache.json")
    }

    public static func defaultCacheDirectory() -> URL {
        if let applicationSupport = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first {
            return applicationSupport
                .appendingPathComponent("DailyReportApp", isDirectory: true)
                .appendingPathComponent("Cache", isDirectory: true)
        }

        return FileManager.default.temporaryDirectory
            .appendingPathComponent("DailyReportApp", isDirectory: true)
            .appendingPathComponent("Cache", isDirectory: true)
    }

    public func load() throws -> CachedSummary? {
        if let current {
            return current
        }

        guard FileManager.default.fileExists(atPath: cacheURL.path) else {
            return nil
        }

        let data = try Data(contentsOf: cacheURL)
        let summary = try DailyReportJSON.decoder.decode(CachedSummary.self, from: data)
        current = summary
        return summary
    }

    @discardableResult
    public func replace(
        with payload: DailyReportPayload,
        status: SyncStatus = .cached,
        importedAt: Date = Date(),
        staleInterval: TimeInterval = 60 * 60,
        errorMessage: String? = nil
    ) throws -> CachedSummary {
        let summary = CachedSummary(
            status: status,
            payload: payload,
            importedAt: importedAt,
            staleAfter: importedAt.addingTimeInterval(staleInterval),
            errorMessage: errorMessage
        )
        try save(summary)
        return summary
    }

    @discardableResult
    public func mark(
        status: SyncStatus,
        errorMessage: String? = nil,
        staleInterval: TimeInterval = 60 * 60
    ) throws -> CachedSummary? {
        guard var summary = try load() else {
            return nil
        }

        let now = Date()
        summary.status = status
        summary.importedAt = now
        summary.staleAfter = now.addingTimeInterval(staleInterval)
        summary.errorMessage = errorMessage
        try save(summary)
        return summary
    }

    public func clearMemory() {
        current = nil
    }

    public func cacheFileURL() -> URL {
        cacheURL
    }

    private func save(_ summary: CachedSummary) throws {
        try FileManager.default.createDirectory(
            at: cacheDirectory,
            withIntermediateDirectories: true
        )
        let data = try DailyReportJSON.encoder.encode(summary)
        try data.write(to: cacheURL, options: [.atomic])
        current = summary
    }
}
