import Foundation

public enum ImportSource: Equatable, Sendable {
    case bundledFixture
    case data(Data)
    case localFile(URL)
    case publicDataDirectory(URL)
    case remote(URL)
}

public enum ImportServiceError: Error, Equatable, LocalizedError, Sendable {
    case missingBundledFixture
    case failedToLoadRemote(URL)
    case failed(String)

    public var errorDescription: String? {
        switch self {
        case .missingBundledFixture:
            return "内置 public-data 样例缺失。/ Bundled public-data fixture is missing."
        case .failedToLoadRemote(let url):
            return "无法加载远端公开数据：\(url.absoluteString)。/ Failed to load remote public data."
        case .failed(let message):
            return message
        }
    }
}

public actor ImportService {
    private let store: SummaryCacheStore
    private let loader: PublicDataLoader

    public init(
        store: SummaryCacheStore = SummaryCacheStore(),
        loader: PublicDataLoader = PublicDataLoader()
    ) {
        self.store = store
        self.loader = loader
    }

    @discardableResult
    public func importPayload(
        from source: ImportSource,
        status: SyncStatus = .cached
    ) async throws -> ImportResult {
        _ = try? await store.mark(status: .syncing)

        do {
            let payload = try await loadPayload(from: source)
            let importedAt = Date()
            let summary = try await store.replace(
                with: payload,
                status: status,
                importedAt: importedAt
            )
            return ImportResult(
                summary: summary,
                importedDocumentCount: payload.documents.count
            )
        } catch {
            _ = try? await store.mark(
                status: .failed,
                errorMessage: error.localizedDescription
            )
            throw error
        }
    }

    public nonisolated func backgroundImportTask(
        from source: ImportSource,
        every interval: TimeInterval = 15 * 60
    ) -> Task<Void, Never> {
        Task {
            while !Task.isCancelled {
                _ = try? await importPayload(from: source)
                let nanoseconds = UInt64(max(interval, 1) * 1_000_000_000)
                try? await Task.sleep(nanoseconds: nanoseconds)
            }
        }
    }

    public static func bundledFixtureData() throws -> Data {
        let url = Bundle.module.url(
            forResource: "daily-report-sample",
            withExtension: "json"
        ) ?? Bundle.module.url(
            forResource: "daily-report-sample",
            withExtension: "json",
            subdirectory: "public-data"
        )

        guard let url else {
            throw ImportServiceError.missingBundledFixture
        }

        return try Data(contentsOf: url)
    }

    public static func defaultPublicDataSource() -> ImportSource {
        let environment = ProcessInfo.processInfo.environment
        if let publicDataDir = environment["PUBLIC_DATA_DIR"], !publicDataDir.isEmpty {
            return .publicDataDirectory(URL(fileURLWithPath: publicDataDir, isDirectory: true))
        }

        if let publicDataBase = environment["PUBLIC_DATA_BASE_URL"],
           let url = URL(string: publicDataBase) {
            return .remote(url)
        }

        if let discovered = PublicDataLoader.discoverLocalPublicDataDirectory() {
            return .publicDataDirectory(discovered)
        }

        return .bundledFixture
    }

    private func loadPayload(from source: ImportSource) async throws -> DailyReportPayload {
        switch source {
        case .bundledFixture:
            let data = try Self.bundledFixtureData()
            return try DailyReportJSON.decoder.decode(DailyReportPayload.self, from: data)
        case .data(let data):
            return try DailyReportJSON.decoder.decode(DailyReportPayload.self, from: data)
        case .localFile(let url):
            var isDirectory: ObjCBool = false
            if FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory),
               isDirectory.boolValue {
                return try loader.load(fromDirectory: url)
            }

            let data = try Data(contentsOf: url)
            return try DailyReportJSON.decoder.decode(DailyReportPayload.self, from: data)
        case .publicDataDirectory(let url):
            return try loader.load(fromDirectory: url)
        case .remote(let url):
            return try await loader.load(fromBaseURL: url)
        }
    }
}
